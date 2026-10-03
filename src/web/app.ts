import { RootController } from './controllers/root';
import { DebugController } from './controllers/debug';

const app = angular.module('battleSnake', []);

app.controller('RootController', RootController);
app.controller('DebugController', DebugController);

export default app;
