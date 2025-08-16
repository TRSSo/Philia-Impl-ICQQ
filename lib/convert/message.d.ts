import icqq from "icqq";
import type * as icqqMsg from "icqq/lib/message/elements.js";
import type * as Philia from "philia/protocol/type";
import type { Project as Impl } from "#impl.js";
export type MessageBase = icqqMsg.TextElem | icqqMsg.AtElem | icqqMsg.ReplyElem | icqqMsg.QuoteElem | icqqMsg.FileElem | icqqMsg.ImageElem | icqqMsg.PttElem | icqqMsg.VideoElem | icqqMsg.MarkdownElem | icqqMsg.ButtonElem;
export type MessageExtend = Exclude<icqqMsg.MessageElem, MessageBase>;
export declare const ExtendArray: MessageExtend["type"][];
/** 消息转换器 */
export declare class ICQQtoPhilia {
  impl: Impl;
  event: icqq.Message | icqq.ForwardMessage;
  /** 转换前的消息 */
  before: icqq.MessageElem[];
  /** 转换后的消息 */
  after: Philia.Message.MessageSegment[];
  /** 消息摘要 */
  summary: string;
  /**
   * @param impl 实现端
   * @param event 消息事件
   */
  constructor(impl: Impl, event: icqq.Message | icqq.ForwardMessage);
  convert(): Promise<this>;
  extend(data: MessageExtend): void;
  _text(text: any, markdown?: string): void;
  text(ms: icqqMsg.TextElem): void;
  at(ms: icqqMsg.AtElem): Promise<void>;
  file(ms: icqqMsg.FileElem): Promise<void>;
  image(ms: icqqMsg.ImageElem): Promise<void>;
  record(ms: icqqMsg.PttElem): Promise<void>;
  video(ms: icqqMsg.VideoElem): Promise<void>;
  reply(ms: icqqMsg.ReplyElem): void;
  quote(ms: icqqMsg.Quotable): Promise<void>;
  markdown(ms: icqqMsg.MarkdownElem): void;
  _button(ms: icqqMsg.Button): Philia.Message.ButtonType;
  button(ms: icqqMsg.ButtonElem): void;
}
export declare class PhiliaToICQQ {
  impl: Impl;
  scene: Philia.Event.Message["scene"];
  id: (Philia.Contact.User | Philia.Contact.Group)["id"];
  before: (string | Philia.Message.MessageSegment)[];
  after: (string | icqq.MessageElem)[];
  summary: string;
  file_id?: string[];
  constructor(impl: Impl, scene: Philia.Event.Message["scene"], id: (Philia.Contact.User | Philia.Contact.Group)["id"], message: Philia.Message.Message);
  convert(): Promise<this>;
  _text(text: any): void;
  text(ms: Philia.Message.Text): void;
  mention(ms: Philia.Message.Mention): void;
  reply(ms: Philia.Message.Reply): void;
  extend(ms: Philia.Message.Extend): void;
  platform(ms: Philia.Message.Platform): void;
  _file(type: MessageBase["type"], ms: Philia.Message.AFile): Promise<void>;
  file(ms: Philia.Message.File): Promise<void>;
  image(ms: Philia.Message.Image): void;
  voice(ms: Philia.Message.Voice): void;
  audio(ms: Philia.Message.Audio): Promise<void>;
  video(ms: Philia.Message.File): void;
  button(): void;
}
