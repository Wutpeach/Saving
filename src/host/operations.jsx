// ES3-compatible: this same entry point can be called through CEP evalScript.
var SavingHost = (function () {
    function quote(value) {
        return '"' + value.replace(/[\"\\\x00-\x1f\u2028\u2029]/g, function (c) {
            if (c === '"') return '\\"';
            if (c === '\\') return '\\\\';
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    function stringify(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return quote(value);
        if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
        if (typeof value === 'boolean') return String(value);
        var parts = [], key, i;
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) parts.push(stringify(value[i]));
            return '[' + parts.join(',') + ']';
        }
        for (key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key))
                parts.push(quote(key) + ':' + stringify(value[key]));
        }
        return '{' + parts.join(',') + '}';
    }
    function execute(request) {
        var result = { protocol: 1, requestId: request.requestId, ok: false };
        try {
            if (request.protocol !== 1 || typeof request.requestId !== 'string')
                throw new Error('Invalid Saving request');
            if (new Date().getTime() > request.deadline) {
                result.error = { code: 'REQUEST_EXPIRED', message: 'Request expired before AE execution' };
                return stringify(result);
            }
            if (request.command === 'host-info') {
                result.data = { version: app.version, buildName: app.buildName,
                    buildNumber: app.buildNumber, language: String(app.isoLanguage) };
            } else if (request.command === 'project-info') {
                var project = app.project;
                var active = project ? project.activeItem : null;
                result.data = { project: project ? {
                    path: project.file ? project.file.fsName : null,
                    itemCount: project.numItems, dirty: project.dirty
                } : null, activeComposition: active instanceof CompItem ? {
                    id: active.id, name: active.name, width: active.width, height: active.height,
                    duration: active.duration, frameRate: active.frameRate, layerCount: active.numLayers
                } : null };
            } else {
                result.error = { code: 'UNKNOWN_COMMAND', message: 'Unknown command: ' + request.command };
                return stringify(result);
            }
            result.ok = true;
        } catch (error) {
            result.error = { code: 'AE_SCRIPT_ERROR', message: String(error), line: error.line || null };
        }
        return stringify(result);
    }
    function run(request, responsePath) {
        var text = execute(request);
        var file = new File(responsePath + '.tmp');
        file.encoding = 'UTF-8';
        if (!file.open('w')) throw new Error('Saving cannot write response: ' + file.error);
        var written = file.write(text);
        var closed = file.close();
        if (!written || !closed || !file.rename(new File(responsePath).name))
            throw new Error('Saving cannot publish response: ' + file.error);
    }
    return { execute: execute, run: run };
})();
