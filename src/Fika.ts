import path from "node:path";
import { DependencyContainer, inject, injectable } from "tsyringe";

import { ILocaleBase } from "@spt/models/spt/server/ILocaleBase";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ImporterUtil } from "@spt/utils/ImporterUtil";

import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { FikaClientController } from "./controllers/FikaClientController";
import { IFikaConfigBackground } from "./models/fika/config/IFikaConfigBackground";
import { IFikaConfigDedicated } from "./models/fika/config/IFikaConfigDedicated";
import { IFikaConfigNatPunchServer } from "./models/fika/config/IFikaConfigNatPunchServer";
import { Overrider } from "./overrides/Overrider";
import { FikaPlayerRelationsCacheService } from "./services/cache/FikaPlayerRelationsCacheService";
import { FikaDedicatedProfileService } from "./services/dedicated/FikaDedicatedProfileService";
import { FikaConfig } from "./utils/FikaConfig";
import { FikaServerTools } from "./utils/FikaServerTools";

@injectable()
export class Fika {
    protected modPath: string;
    protected natPunchServerConfig: IFikaConfigNatPunchServer;
    protected dedicatedConfig: IFikaConfigDedicated;
    protected backgroundConfig: IFikaConfigBackground;

    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("Overrider") protected overrider: Overrider,
        @inject("FikaServerTools") protected fikaServerTools: FikaServerTools,
        @inject("FikaConfig") protected fikaConfig: FikaConfig,
        @inject("FikaClientController") protected fikaClientController: FikaClientController,
        @inject("FikaDedicatedProfileService") protected fikaDedicatedProfileService: FikaDedicatedProfileService,
        @inject("ImageRouter") protected imageRouter: ImageRouter,
        @inject("ImporterUtil") protected importerUtil: ImporterUtil,
        @inject("FikaPlayerRelationsCacheService") protected fikaPlayerRelationCacheServce: FikaPlayerRelationsCacheService,
    ) {
        this.modPath = fikaConfig.getModPath();
    }

    public async preSptLoad(container: DependencyContainer): Promise<void> {
        await this.fikaConfig.preInit();

        this.natPunchServerConfig = this.fikaConfig.getConfig().natPunchServer;
        this.dedicatedConfig = this.fikaConfig.getConfig().dedicated;
        this.backgroundConfig = this.fikaConfig.getConfig().background;

        await this.fikaClientController.preInit();
        await this.overrider.override(container);
    }

    public async postSptLoad(_container: DependencyContainer): Promise<void> {
        if (this.natPunchServerConfig.enable) {
            this.fikaServerTools.startService("NatPunchServer");
        }

        if (this.dedicatedConfig.profiles.amount > 0) {
            this.fikaDedicatedProfileService.init();
        }

        await this.addFikaClientLocales();
        this.blacklistSpecialProfiles();
        this.fikaPlayerRelationCacheServce.postInit();

        if (this.backgroundConfig.enable) {
            const image = this.backgroundConfig.easteregg ? "assets/images/launcher/bg-senko.png" : "assets/images/launcher/bg.png";
            this.imageRouter.addRoute("/files/launcher/bg", path.join(this.modPath, image));
        }
    }

    private async addFikaClientLocales() {
        const database = this.databaseServer.getTables();
        const databasePath = path.join(this.fikaConfig.getModPath(), "assets/database/").replace(/\\/g, "/");

        const locales = await this.importerUtil.loadAsync<ILocaleBase>(`${databasePath}locales/`, databasePath);

        for (const folderName in locales) {
            if (folderName === "global") {
                for (const localeKey in locales.global) {
                    const localeData = locales.global[localeKey];
                    database.locales.global[localeKey] = { ...database.locales.global[localeKey], ...localeData };
                }
            }
        }
    }

    private async blacklistSpecialProfiles() {
        const coreConfig: ICoreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        const profileBlacklist = coreConfig.features.createNewProfileTypesBlacklist;

        if (!this.fikaConfig.getConfig().server.showDevProfile) {
            profileBlacklist.push("SPT Developer");
        }

        if (!this.fikaConfig.getConfig().server.showNonStandardProfile) {
            for (const id of ["Tournament", "SPT Easy start", "SPT Zero to hero"]) {
                profileBlacklist.push(id);
            }
        }
    }
}
