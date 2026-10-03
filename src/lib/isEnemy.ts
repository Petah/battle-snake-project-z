import { BTSnake } from '../types/BTData';

const mySnakes = [
    'aldo',
    'dunno',
    'keepaway',
    'lookahead',
    'projectz',
    'projectz2',
    'rando',
    'tailchase',
    'tak',
    'workitout',
];

export function isEnemy(you: BTSnake, other: BTSnake) {
    if (you.id == other.id || (you.squad && you.squad == other.squad)) {
        return false;
    }
    return true;
}

export function isSquad(you: BTSnake, other: BTSnake, checkNames: boolean) {
    if (you.id == other.id) {
        return false;
    }
    if (you.squad && you.squad == other.squad) {
        return true;
    }
    if (checkNames) {
        if (mySnakes.indexOf(other.name.toLowerCase().replace(/[^a-z0-9]/g, '')) >= 0) {
            return true;
        }
    }
    return false;
}
