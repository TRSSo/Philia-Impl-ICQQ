import type icqq from "icqq";
import type * as Philia from "philia/protocol/type";
import type { Project as Impl } from "#impl.js";
export type EventMap = Pick<icqq.EventMap, (typeof ICQQtoPhilia.event)[number]>;
export type EventParam<T extends keyof EventMap> = Parameters<EventMap[T]>[0];
export default class ICQQtoPhilia implements EventMap {
  impl: Impl;
  static event: readonly ["system.login.qrcode", "system.login.slider", "system.login.device", "system.login.auth", "system.login.error", "system.offline", "system.online", "message.private", "message.group", "request.friend", "request.group"];
  constructor(impl: Impl);
  "system.login.qrcode"(event: EventParam<"system.login.qrcode">): Promise<void>;
  handleLoginDevice(msg: string): Promise<void>;
  "system.login.slider"(event: EventParam<"system.login.slider">): void;
  handleLoginSlider(event: EventParam<"system.login.slider">, msg: string): Promise<void>;
  "system.login.device"(event: EventParam<"system.login.device">): void;
  "system.login.auth"(event: EventParam<"system.login.auth">): void;
  "system.login.error"(event: EventParam<"system.login.error">): void;
  "system.offline"(event: EventParam<"system.offline">): Promise<void> | Promise<PromiseSettledResult<void>[]>;
  "system.online"(): Promise<PromiseSettledResult<void>[]> | Promise<import("../../../../lib/connect/socket/server.js").Server> | Promise<import("../../../../lib/connect/websocket/server.js").Server>;
  PrivateMessage(data: icqq.PrivateMessage): Promise<Philia.Event.UserMessage>;
  "message.private"(event: EventParam<"message.private">): Promise<void>;
  GroupMessage(data: icqq.GroupMessage): Promise<Philia.Event.GroupMessage>;
  "message.group"(event: EventParam<"message.group">): Promise<void>;
  Message(data: icqq.PrivateMessage | icqq.GroupMessage): Promise<Philia.Event.UserMessage | Philia.Event.GroupMessage>;
  ForwardMessage(data: icqq.ForwardMessage): Promise<Philia.Message.Forward>;
  FriendRequest(data: EventParam<"request.friend">): Promise<Philia.Event.UserRequest>;
  "request.friend"(event: EventParam<"request.friend">): Promise<void>;
  GroupRequest(data: EventParam<"request.group">): Promise<Philia.Event.GroupRequest>;
  "request.group"(event: EventParam<"request.group">): Promise<void>;
}
