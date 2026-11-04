import { Router } from './route';

globalThis.executions.registry++;
globalThis.requireRoute = () => require('./route');

export const routes = [Router];
