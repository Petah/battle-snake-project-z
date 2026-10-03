import { StrategyRequest } from "../types/BTData";

export function cache(request: StrategyRequest, key: string, value: any) {
    if (!request.cache[key]) {
        request.cache[key] = value;
    }
    return request.cache[key];
}