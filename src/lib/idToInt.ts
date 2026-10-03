import { md5 } from 'js-md5';

export function idToInt(id: string): number {
    return parseInt(md5(id), 16);
}
