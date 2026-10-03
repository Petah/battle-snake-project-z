export interface AngularScope {
    $on: (event: string, callback: () => void) => void,
    $apply: () => void,
    $broadcast: (message: string) => void,
    $watch: (watchExpression: string, listener: (...any) => void, deepCompare?: boolean) => void,
}
