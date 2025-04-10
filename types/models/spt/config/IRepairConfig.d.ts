import { MinMax } from "@spt/models/common/MinMax";
import { IBaseConfig } from "@spt/models/spt/config/IBaseConfig";
export interface IRepairConfig extends IBaseConfig {
    kind: "spt-repair";
    priceMultiplier: number;
    applyRandomizeDurabilityLoss: boolean;
    weaponSkillRepairGain: number;
    armorKitSkillPointGainPerRepairPointMultiplier: number;
    /** INT gain multiplier per repaired item type */
    repairKitIntellectGainMultiplier: IIntellectGainValues;
    maxIntellectGainPerRepair: IMaxIntellectGainValues;
    weaponTreatment: IWeaponTreatmentRepairValues;
    repairKit: IRepairKit;
}
export interface IIntellectGainValues {
    weapon: number;
    armor: number;
}
export interface IMaxIntellectGainValues {
    kit: number;
    trader: number;
}
export interface IWeaponTreatmentRepairValues {
    /** The chance to gain more weapon maintenance skill */
    critSuccessChance: number;
    critSuccessAmount: number;
    /** The chance to gain less weapon maintenance skill  */
    critFailureChance: number;
    critFailureAmount: number;
    /** The multiplier used for calculating weapon maintenance XP */
    pointGainMultiplier: number;
}
export interface IRepairKit {
    armor: IBonusSettings;
    weapon: IBonusSettings;
}
export interface IBonusSettings {
    rarityWeight: Record<string, number>;
    bonusTypeWeight: Record<string, number>;
    common: Record<string, IBonusValues>;
    rare: Record<string, IBonusValues>;
}
export interface IBonusValues {
    valuesMinMax: MinMax;
    /** What dura is buff active between (min max of current max) */
    activeDurabilityPercentMinMax: MinMax;
}
