import icqq from "icqq";
import * as Common from "philia/project/project/common.js";
import * as Philia from "philia/project/project/philia.js";
import EventHandle from "philia/protocol/common/event.js";
import { API, Event } from "#convert";
export interface IConfig extends Common.IConfig {
  name: "ICQQ";
  uin: number;
  passwd: string;
  config: icqq.Config;
  slider: string | URL;
}
export declare class Project extends Common.Project {
  config: IConfig;
  client: icqq.Client;
  philia: Philia.Project;
  handle: API;
  event: Event;
  event_handle: EventHandle;
  constructor(config: IConfig);
  static createConfig(name: IConfig["name"]): Promise<IConfig>;
  static edit_config_key: [keyof icqq.Config, string, "string" | "number" | "boolean"][];
  static editConfig(config: IConfig): Promise<void>;
  verifyConfig(): void;
  start(): Promise<void>;
  stop(): Promise<[PromiseSettledResult<void>, PromiseSettledResult<void | PromiseSettledResult<void>[]>]>;
}
