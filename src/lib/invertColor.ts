function toHex(n: number): string {
    return padZero(n.toString(16));
}

function padZero(str, len = 2): string {
    const zeros = new Array(len).join('0');
    return (zeros + str).slice(-len);
}

function rgb2hex(rgb: string): string {
    const match = rgb.match(/^rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)(?:,\s*([0-9.]+))?\)$/);
    if (!match) {
        return rgb;
    }
    return "#" + toHex(parseInt(match[1])) + toHex(parseInt(match[2])) + toHex(parseInt(match[3]));
}

export function invertColor(hex: string, bw: boolean = true): string {
    hex = rgb2hex(hex);
    if (hex.indexOf('#') === 0) {
        hex = hex.slice(1);
    }
    // convert 3-digit hex to 6-digits.
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
        throw new Error('Invalid HEX color: ' + hex);
    }
    const r = parseInt(hex.slice(0, 2), 16),
        g = parseInt(hex.slice(2, 4), 16),
        b = parseInt(hex.slice(4, 6), 16);
    if (bw) {
        // http://stackoverflow.com/a/3943023/112731
        return (r * 0.299 + g * 0.587 + b * 0.114) > 186
            ? '#000000'
            : '#FFFFFF';
    }
    // invert color components
    // pad each with zeros and return
    return "#" + toHex(255 - r) + toHex(255 - g) + toHex(255 - b);
}
