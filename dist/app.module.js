"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const ai_module_1 = require("./ai/ai.module");
const consumption_module_1 = require("./consumption/consumption.module");
const users_module_1 = require("./users/users.module");
const automation_module_1 = require("./automation/automation.module");
const database_module_1 = require("./database/database.module");
const monitoring_module_1 = require("./monitoring/monitoring.module");
const ai_config_1 = require("./common/config/ai.config");
const database_config_1 = require("./common/config/database.config");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [ai_config_1.aiConfig, database_config_1.databaseConfig],
                envFilePath: ['.env.local', '.env'],
            }),
            throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 100,
                }]),
            ai_module_1.AiModule,
            consumption_module_1.ConsumptionModule,
            users_module_1.UsersModule,
            automation_module_1.AutomationModule,
            database_module_1.DatabaseModule,
            monitoring_module_1.MonitoringModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map