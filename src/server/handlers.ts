import { Request, Response, NextFunction } from 'express';

export interface HttpError extends Error {
    status?: number;
}

export function genericErrorHandler(error: HttpError, _request: Request, response: Response, next: NextFunction) {
    if (response.headersSent) {
        return next(error);
    }
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500) {
        console.error(error);
    }
    return response.status(status).json({
        status,
        error: status >= 500 ? 'Internal server error' : error.message,
    });
}
