import { loadGrid } from "./web/grid";
import { Logger } from "./lib/log";
import app from "./web/app";

Logger.console = true;
Logger.enabled = true;

declare global {
    interface Window {
        loadGrid: any;
        app: any;
    }
}

window.loadGrid = window.loadGrid || loadGrid;
window.app = window.app || app;
