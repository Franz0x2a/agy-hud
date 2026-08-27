const ANSI_CSI = /\u001b\[[0-?]*[ -\/]*[@-~]/g;
const ANSI_OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const UNSAFE_TERMINAL_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/g;
/** Strip terminal escapes, control characters, and Unicode bidi controls from untrusted text. */
export function sanitizeTerminalText(value, maxLength) {
    const sanitized = value
        .replace(ANSI_OSC, '')
        .replace(ANSI_CSI, '')
        .replace(UNSAFE_TERMINAL_TEXT, '');
    return maxLength === undefined ? sanitized : sanitized.slice(0, maxLength);
}
//# sourceMappingURL=sanitize.js.map