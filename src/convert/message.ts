import icqq from "icqq"
import type * as icqqMsg from "icqq/lib/message/elements.js"
import type * as Philia from "philia/protocol/type"
import { modeMatch } from "philia/util"
import type { Project as Impl } from "#impl.js"

export type MessageBase =
  | icqqMsg.TextElem
  | icqqMsg.AtElem
  | icqqMsg.ReplyElem
  | icqqMsg.QuoteElem
  | icqqMsg.FileElem
  | icqqMsg.ImageElem
  | icqqMsg.PttElem
  | icqqMsg.VideoElem
  | icqqMsg.MarkdownElem
  | icqqMsg.ButtonElem
export type MessageExtend = Exclude<icqqMsg.MessageElem, MessageBase>
export const ExtendArray: MessageExtend["type"][] = [
  "face",
  "sface",
  "bface",
  "rps",
  "dice",
  "mirai",
  "node",
  "forum",
  "flash",
  "json",
  "xml",
  "poke",
  "location",
  "share",
  "music",
  "long_msg",
]

/** 消息转换器 */
export class ICQQtoPhilia {
  /** 转换前的消息 */
  before: icqq.MessageElem[]
  /** 转换后的消息 */
  after: Philia.Message.MessageSegment[] = []
  /** 消息摘要 */
  summary = ""

  /**
   * @param impl 实现端
   * @param event 消息事件
   */
  constructor(
    public impl: Impl,
    public event: icqq.Message | icqq.ForwardMessage,
  ) {
    this.before = event.message
  }

  async convert() {
    for (const i of this.before) {
      if (typeof i !== "object") this._text(i)
      else if (typeof this[(i as MessageBase).type] === "function")
        await this[(i as MessageBase).type](i as never)
      else if (ExtendArray.includes((i as MessageExtend).type)) this.extend(i as MessageExtend)
      else this._text(i)
    }
    if ((this.event as icqq.Message).source) await this.quote((this.event as icqq.Message).source!)
    return this
  }

  extend(data: MessageExtend) {
    this.after.push({ type: "extend", extend: `ICQQ.${data.type}`, data })
    this.summary += `[${data.type}: ${data}]`
  }

  _text(text: any, markdown?: string) {
    const ms: Philia.Message.Text = { type: "text", data: String(text) }
    if (!ms.data.length) return
    if (markdown) ms.markdown = markdown
    this.after.push(ms)
    this.summary += ms.data
  }

  text(ms: icqqMsg.TextElem) {
    this._text(ms.text)
  }

  async at(ms: icqqMsg.AtElem) {
    let { qq, text = "" } = ms
    if (qq === "all") {
      this.summary += `[提及全体成员]`
      this.after.push({ type: "mention", data: "all" })
      return
    }

    const id = String(qq)
    if (!text) {
      let info: Philia.Contact.GroupMember
      if (this.event instanceof icqq.GroupMessage)
        info = await this.impl.handle.getGroupMemberInfo({
          id: String(this.event.group_id),
          uid: id,
        })
      info ??= (await this.impl.handle.getUserInfo({ id })) as unknown as Philia.Contact.GroupMember
      if (info) text = info.card || info.name
    }

    this.summary += `[提及: ${text}(${id})]`
    this.after.push({ type: "mention", data: "user", id, name: text })
  }

  async file(ms: icqqMsg.FileElem) {
    this.after.push({
      raw: ms as unknown as undefined,
      type: "file",
      id: ms.fid,
      data: "id",
      name: ms.name,
    })
    this.summary += `[文件: ${ms.name}(${ms.fid})]`
  }

  async image(ms: icqqMsg.ImageElem) {
    this.after.push({
      raw: ms as unknown as undefined,
      type: "image",
      id: String(ms.fid || ms.file),
      name: ms.file as string,
      data: "url",
      url: ms.url!,
    })
    this.summary += `[图片: ${ms.md5}]`
  }

  async record(ms: icqqMsg.PttElem) {
    this.after.push({
      raw: ms as unknown as undefined,
      type: "voice",
      id: String(ms.fid || ms.file),
      name: ms.file as string,
      data: "url",
      url: ms.url!,
    })
    this.summary += `[语音: ${ms.md5}]`
  }

  async video(ms: icqqMsg.VideoElem) {
    this.after.push({
      raw: ms as unknown as undefined,
      type: "video",
      id: String(ms.fid || ms.file),
      name: ms.file as string,
      data: "id",
    })
    this.summary += "[视频]"
  }

  reply(ms: icqqMsg.ReplyElem) {
    this.after.push({ type: "reply", data: ms.id, summary: ms.text })
    this.summary += `[提及: ${ms.text ? `${ms.text}(${ms.id})` : ms.id}]`
  }

  async quote(ms: icqqMsg.Quotable) {
    let data: string
    if (this.event instanceof icqq.GroupMessage)
      data = (await this.impl.client.pickGroup(this.event.group_id).getChatHistory(ms.seq, 1))[0]
        ?.message_id
    else if (this.event instanceof icqq.PrivateMessage)
      data = (
        await this.impl.client.pickFriend(this.event.sender.user_id).getChatHistory(ms.time, 1)
      )[0]?.message_id
    else return

    this.after.push({ type: "reply", data, summary: ms.message as string })
    this.summary += `[提及: ${ms.message ? `${ms.message}(${data})` : data}]`
  }

  markdown(ms: icqqMsg.MarkdownElem) {
    this.after.push({
      raw: ms as unknown as undefined,
      type: "text",
      data: ms.content,
      markdown: ms.content,
    })
    this.summary += `[Markdown: ${ms.content}]`
  }

  _button(ms: icqqMsg.Button) {
    const button = {
      QQBot: ms,
      text: ms.render_data.label,
      clicked_text: ms.render_data.visited_label,
    } as unknown as Philia.Message.ButtonType

    switch (ms.action.type) {
      case 0:
        button.link = ms.action.data
        break
      case 1:
        button.callback = ms.action.data
        break
      case 2:
        button.input = ms.action.data
        button.send = ms.action.enter
        break
    }

    if (ms.action.permission) {
      if (ms.action.permission.type === 1) button.permission = "admin"
      else button.permission = ms.action.permission.specify_user_ids
    }

    return button
  }

  button(ms: icqqMsg.ButtonElem) {
    const data = ms.content.rows.map(row => row.buttons.map(this._button.bind(this))) || []
    this.after.push({ raw: ms as unknown as undefined, type: "button", data })
    this.summary += "[按钮]"
  }
}

export class PhiliaToICQQ {
  before: (string | Philia.Message.MessageSegment)[]
  after: (string | icqq.MessageElem)[] = []
  summary = ""
  file_id?: string[]

  constructor(
    public impl: Impl,
    public scene: Philia.Event.Message["scene"],
    public id: (Philia.Contact.User | Philia.Contact.Group)["id"],
    message: Philia.Message.Message,
  ) {
    this.before = Array.isArray(message) ? message : [message]
  }

  async convert() {
    for (const i of this.before) {
      if (typeof i === "object" && typeof this[i.type] === "function")
        await this[i.type](i as never)
      else this._text(i)
    }
    return this
  }

  _text(text: any) {
    text = String(text)
    if (!text.length) return
    this.after.push(text)
    this.summary += text
  }

  text(ms: Philia.Message.Text) {
    this._text(ms.data)
  }

  mention(ms: Philia.Message.Mention) {
    switch (ms.data) {
      case "user":
        this.after.push({
          type: "at",
          qq: +ms.id,
          text: ms.name,
        })
        this.summary += ms.name ? `@${ms.name}(${ms.id})` : `@${ms.id}`
        break
      case "all":
        this.after.push({ type: "at", qq: "all" })
        this.summary += `@全体成员`
        break
    }
  }

  reply(ms: Philia.Message.Reply) {
    this.after.push({ type: "reply", id: ms.data, text: ms.summary })
    this.summary += ms.summary ? `[回复: ${ms.summary}(${ms.data})]` : `[回复: ${ms.data}]`
  }

  extend(ms: Philia.Message.Extend) {
    if (!ms.extend.startsWith("ICQQ.")) return
    const extend = ms.extend.replace("ICQQ.", "") as MessageExtend["type"]
    if (ExtendArray.includes(extend)) {
      this.after.push(ms.data as icqq.MessageElem)
      this.summary += `[${(ms.data as icqq.MessageElem).type}: ${ms.data}]`
    }
  }

  platform(ms: Philia.Message.Platform) {
    this.summary += `[${ms.list}(${ms.mode}) 平台消息: ${ms.data}]`
    if (modeMatch(ms, "ICQQ"))
      if (Array.isArray(ms.data)) this.after.push(...(ms.data as icqq.MessageElem[]))
      else this.after.push(ms.data as icqq.MessageElem)
  }

  async _file(type: MessageBase["type"], ms: Philia.Message.AFile): Promise<void> {
    switch (ms.data) {
      case "id":
        return this._file(type, await this.impl.handle.getFile({ id: ms.id as string }))
      case "path":
        this.after.push({ type, file: ms.path } as MessageBase)
        break
      case "binary":
        this.after.push({ type, file: ms.binary } as MessageBase)
        break
      case "url":
        this.after.push({ type, file: ms.url } as MessageBase)
        break
    }
  }

  async file(ms: Philia.Message.File) {
    const ret = await this.impl.handle._sendFile({ scene: this.scene, id: this.id, data: ms })
    this.file_id ??= []
    this.file_id.push(ret)
    this.summary += ms.summary ?? `[文件: ${ms.name}]`
  }

  image(ms: Philia.Message.Image) {
    this._file("image", ms)
    this.summary += ms.summary ?? `[图片: ${ms.name}]`
  }

  voice(ms: Philia.Message.Voice) {
    this._file("record", ms)
    this.summary += ms.summary ?? `[语音: ${ms.name}]`
  }

  async audio(ms: Philia.Message.Audio) {
    await this.impl.handle._sendFile({
      scene: this.scene,
      id: this.id,
      data: ms,
    })
    this.summary += ms.summary ?? `[音频: ${ms.name}]`
  }

  video(ms: Philia.Message.File) {
    this._file("video", ms)
    this.summary += ms.summary ?? `[视频: ${ms.name}]`
  }

  button() {}
}
