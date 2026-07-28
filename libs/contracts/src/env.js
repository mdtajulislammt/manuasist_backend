"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireEnv = requireEnv;
exports.getRabbitmqUrl = getRabbitmqUrl;
function requireEnv(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function getRabbitmqUrl() {
    return process.env.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672';
}
//# sourceMappingURL=env.js.map