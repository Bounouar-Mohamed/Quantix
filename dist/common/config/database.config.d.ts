export declare const databaseConfig: (() => {
    prisma: {
        url: string;
        logLevel: string;
    };
    microservice: {
        host: string;
        port: number;
        jwtSecret: string;
        jwtExpiresIn: string;
    };
    crmConnection: {
        baseUrl: string;
        apiKey: string;
        timeout: number;
    };
    redis: {
        host: string;
        port: number;
        password: string;
        db: number;
    };
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    prisma: {
        url: string;
        logLevel: string;
    };
    microservice: {
        host: string;
        port: number;
        jwtSecret: string;
        jwtExpiresIn: string;
    };
    crmConnection: {
        baseUrl: string;
        apiKey: string;
        timeout: number;
    };
    redis: {
        host: string;
        port: number;
        password: string;
        db: number;
    };
}>;
