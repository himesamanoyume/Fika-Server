import { inject, injectable } from "tsyringe";
import { WebSocket } from "ws";

import { InraidController } from "@spt/controllers/InraidController";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IRegisterPlayerRequestData } from "@spt/models/eft/inRaid/IRegisterPlayerRequestData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";

import { EFikaMatchEndSessionMessage } from "../models/enums/EFikaMatchEndSessionMessages";
import { EFikaNotifications } from "../models/enums/EFikaNotifications";
import { EHeadlessStatus } from "../models/enums/EHeadlessStatus";
import { IFikaRaidServerIdRequestData } from "../models/fika/routes/raid/IFikaRaidServerIdRequestData";
import { IFikaRaidCreateRequestData } from "../models/fika/routes/raid/create/IFikaRaidCreateRequestData";
import { IFikaRaidCreateResponse } from "../models/fika/routes/raid/create/IFikaRaidCreateResponse";
import { IFikaRaidGethostResponse } from "../models/fika/routes/raid/gethost/IFikaRaidGethostResponse";
import { IFikaRaidSettingsResponse } from "../models/fika/routes/raid/getsettings/IFikaRaidSettingsResponse";
import { IGetStatusHeadlessResponse } from "../models/fika/routes/raid/headless/IGetStatusHeadlessResponse";
import { IStartHeadlessRequest } from "../models/fika/routes/raid/headless/IStartHeadlessRequest";
import { IStartHeadlessResponse } from "../models/fika/routes/raid/headless/IStartHeadlessResponse";
import { IStatusHeadlessRequest } from "../models/fika/routes/raid/headless/IStatusHeadlessRequest";
import { IStatusHeadlessResponse } from "../models/fika/routes/raid/headless/IStatusHeadlessResponse";
import { IFikaRaidJoinRequestData } from "../models/fika/routes/raid/join/IFikaRaidJoinRequestData";
import { IFikaRaidJoinResponse } from "../models/fika/routes/raid/join/IFikaRaidJoinResponse";
import { IFikaRaidLeaveRequestData } from "../models/fika/routes/raid/leave/IFikaRaidLeaveRequestData";
import { IStartRaidNotification } from "../models/fika/websocket/notifications/IStartRaidNotification";
import { FikaMatchService } from "../services/FikaMatchService";
import { FikaHeadlessRaidService } from "../services/headless/FikaHeadlessRaidService";
import { FikaHeadlessRaidWebSocket } from "../websockets/FikaHeadlessRaidWebSocket";
import { FikaNotificationWebSocket } from "../websockets/FikaNotificationWebSocket";

@injectable()
export class FikaRaidController {
    constructor(
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("FikaMatchService") protected fikaMatchService: FikaMatchService,
        @inject("FikaHeadlessRaidService") protected fikaHeadlessRaidService: FikaHeadlessRaidService,
        @inject("FikaHeadlessRaidWebSocket") protected fikaHeadlessRaidWebSocket: FikaHeadlessRaidWebSocket,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("InraidController") protected inraidController: InraidController,
        @inject("FikaNotificationWebSocket") protected fikaNotificationWebSocket: FikaNotificationWebSocket,
    ) {
        // empty
    }

    /**
     * Handle /fika/raid/create
     * @param request
     */
    public handleRaidCreate(request: IFikaRaidCreateRequestData): IFikaRaidCreateResponse {
        const notification: IStartRaidNotification = {
            type: EFikaNotifications.StartedRaid,
            nickname: request.hostUsername,
            location: request.settings.location,
        };

        this.fikaNotificationWebSocket.broadcast(notification);

        return {
            success: this.fikaMatchService.createMatch(request),
        };
    }

    /**
     * Handle /fika/raid/join
     * @param request
     */
    public handleRaidJoin(request: IFikaRaidJoinRequestData): IFikaRaidJoinResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);

        return {
            serverId: request.serverId,
            timestamp: match.timestamp,
            gameVersion: match.gameVersion,
            fikaVersion: match.fikaVersion,
            raidCode: match.raidCode,
        };
    }

    /**
     * Handle /fika/raid/leave
     * @param request
     */
    public handleRaidLeave(request: IFikaRaidLeaveRequestData): void {
        if (request.serverId === request.profileId) {
            this.fikaMatchService.endMatch(request.serverId, EFikaMatchEndSessionMessage.HOST_SHUTDOWN_MESSAGE);
            return;
        }

        this.fikaMatchService.removePlayerFromMatch(request.serverId, request.profileId);
    }

    /**
     * Handle /fika/raid/gethost
     * @param request
     */
    public handleRaidGetHost(request: IFikaRaidServerIdRequestData): IFikaRaidGethostResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);
        if (!match) {
            return;
        }

        return {
            ips: match.ips,
            port: match.port,
            natPunch: match.natPunch,
            isHeadless: match.isHeadless,
        };
    }

    /**
     * Handle /fika/raid/getsettings
     * @param request
     */
    public handleRaidGetSettings(request: IFikaRaidServerIdRequestData): IFikaRaidSettingsResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);
        if (!match) {
            return;
        }

        return {
            metabolismDisabled: match.raidConfig.metabolismDisabled,
            playersSpawnPlace: match.raidConfig.playersSpawnPlace,
            hourOfDay: match.raidConfig.timeAndWeatherSettings.hourOfDay,
            timeFlowType: match.raidConfig.timeAndWeatherSettings.timeFlowType,
        };
    }

    /** Handle /fika/raid/headless/start */
    public handleRaidStartHeadless(sessionID: string, info: IStartHeadlessRequest): IStartHeadlessResponse {
        if (!this.fikaHeadlessRaidService.isHeadlessClientAvailable()) {
            return {
                matchId: null,
                error: "No headless clients available.",
            };
        }

        if (sessionID in this.fikaHeadlessRaidService.headlessClients) {
            return {
                matchId: null,
                error: "You are trying to connect to a headless client while having Fika.Headless installed. Please remove Fika.Headless from your client and try again.",
            };
        }

        let HeadlessClient: string | undefined = undefined;
        let HeadlessClientWs: WebSocket | undefined = undefined;

        for (const headlessSessionId in this.fikaHeadlessRaidService.headlessClients) {
            const headlessClientInfo = this.fikaHeadlessRaidService.headlessClients[headlessSessionId];

            if (headlessClientInfo.state != EHeadlessStatus.READY) {
                continue;
            }

            HeadlessClientWs = this.fikaHeadlessRaidWebSocket.clientWebSockets[headlessSessionId];

            if (!HeadlessClientWs || HeadlessClientWs.readyState == WebSocket.CLOSED) {
                continue;
            }

            HeadlessClient = headlessSessionId;
            break;
        }

        if (!HeadlessClient) {
            return {
                matchId: null,
                error: "No headless client available at this time.",
            };
        }

        const pmcHeadlessclientProfile: IPmcData = this.profileHelper.getPmcProfile(HeadlessClient);
        const requesterProfile: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        this.logger.debug(`Headless: ${pmcHeadlessclientProfile.Info.Nickname} ${pmcHeadlessclientProfile.Info.Level} - Requester: ${requesterProfile.Info.Nickname} ${requesterProfile.Info.Level}`);

        //Set level of the headless client profile to the person that has requested the raid to be started.
        pmcHeadlessclientProfile.Info.Level = requesterProfile.Info.Level;
        pmcHeadlessclientProfile.Info.Experience = requesterProfile.Info.Experience;

        this.fikaHeadlessRaidService.requestedSessions[HeadlessClient] = sessionID;

        HeadlessClientWs.send(
            JSON.stringify({
                type: "fikaHeadlessStartRaid",
                ...info,
            }),
        );

        this.logger.info(`Sent WS fikaHeadlessStartRaid to ${HeadlessClient}`);

        return {
            // This really isn't required, I just want to make sure on the client
            matchId: HeadlessClient,
            error: null,
        };
    }

    /** Handle /fika/raid/headless/status */
    public handleRaidStatusHeadless(sessionId: string, info: IStatusHeadlessRequest): IStatusHeadlessResponse {
        // Temp fix because the enum gets deserialized as a string instead of an integer
        switch (info.status.toString()) {
            case "READY":
                info.status = EHeadlessStatus.READY;
                break;
            case "IN_RAID":
                info.status = EHeadlessStatus.IN_RAID;
                break;
        }

        if (info.status == EHeadlessStatus.READY && !this.fikaHeadlessRaidService.isHeadlessClientAvailable()) {
            if (this.fikaHeadlessRaidService.onHeadlessClientAvailable) {
                this.fikaHeadlessRaidService.onHeadlessClientAvailable();
            }
        }

        this.fikaHeadlessRaidService.headlessClients[sessionId] = {
            state: info.status,
            lastPing: Date.now(),
        };

        return {
            sessionId: info.sessionId,
            status: info.status,
        };
    }

    /** Handle /fika/raid/headless/getstatus */
    public handleRaidGetStatusHeadless(): IGetStatusHeadlessResponse {
        return {
            available: this.fikaHeadlessRaidService.isHeadlessClientAvailable(),
        };
    }

    /** Handle /fika/raid/registerPlayer */
    public handleRaidRegisterPlayer(sessionId: string, info: IRegisterPlayerRequestData): void {
        this.inraidController.addPlayer(sessionId, info);
    }
}
