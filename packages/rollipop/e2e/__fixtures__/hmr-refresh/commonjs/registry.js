const { Router } = require('./route');

globalThis.executions.registry++;
globalThis.requireRoute = () => require('./route');

module.exports = { routes: [Router] };
