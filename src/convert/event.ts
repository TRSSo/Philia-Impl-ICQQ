import { setTimeout } from "node:timers/promises"
import type icqq from "icqq"
import type * as Philia from "philia/protocol/type"
import type { Project as Impl } from "#impl.js"
import * as Message from "./message.js"

export type EventMap = Pick<icqq.EventMap, (typeof ICQQtoPhilia.event)[number]>
export type EventParam<T extends keyof EventMap> = Parameters<EventMap[T]>[0]

export default class ICQQtoPhilia implements EventMap {
  static event = [
    "system.login.qrcode",
    "system.login.slider",
    "system.login.device",
    "system.login.auth",
    "system.login.error",
    "system.offline",
    "system.online",
    "message.private",
    "message.group",
    "request.friend",
    "request.group",
  ] as const

  constructor(public impl: Impl) {
    for (const i of ICQQtoPhilia.event) impl.client.on(i, this[i].bind(this))
  }

  async "system.login.qrcode"(event: EventParam<"system.login.qrcode">) {
    this.impl.manager.notice.set("扫码登录", `扫码登录：${event.image}`)
    for (;;) {
      await setTimeout(3000)
      const { retcode } = await this.impl.client.queryQrcodeResult()
      switch (retcode) {
        case 0:
          return this.impl.client.qrcodeLogin()
        case 17:
          return this.impl.manager.notice.set("登录错误", "二维码已过期")
        case 54:
          return this.impl.manager.notice.set("登录错误", "扫码登录取消")
      }
    }
  }

  async handleLoginDevice(msg: string) {
    if (msg === "1") {
      await this.impl.client.sendSmsCode()
      this.impl.manager.notice.set(
        "短信验证",
        "短信已发送，请输入验证码",
        msg => {
          this.impl.client.submitSmsCode(msg)
        },
        true,
      )
    } else this.impl.client.login()
  }

  "system.login.slider"(event: EventParam<"system.login.slider">) {
    this.impl.manager.notice.set(
      "滑动验证",
      `Bot 与浏览器处于同一网络下推荐网页，否则网页反代\n` +
        `网页反代验证：输入1\n` +
        `网页验证：输入2\n` +
        `手动验证：输入得到的ticket\n` +
        event.url,
      msg => {
        this.handleLoginSlider(event, msg)
      },
      true,
    )
  }

  async handleLoginSlider(event: EventParam<"system.login.slider">, msg: string) {
    const fnc = {} as { ticket: () => string | Promise<string>; close: () => void }
    switch (msg) {
      case "1": {
        const ws = new WebSocket(this.impl.config.slider)
        const wsSend = (data: object) => {
          this.impl.logger.debug(`发送 ${this.impl.config.slider}`, data)
          ws.send(JSON.stringify(data))
        }
        let ticket: string | Error
        fnc.ticket = () => {
          if (ticket instanceof Error) throw ticket
          return ticket
        }
        fnc.close = ws.close.bind(ws)
        ws.onclose = () => {
          this.impl.logger.debug(`连接关闭 ${this.impl.config.slider}`)
          ticket ??= Error(`连接关闭 ${this.impl.config.slider}`)
        }
        ws.onerror = error => {
          this.impl.logger.debug(`连接错误 ${this.impl.config.slider}`, error)
          ticket ??= Error(`连接错误 ${this.impl.config.slider}`, { cause: error })
          fnc.close()
        }
        ws.onopen = () => {
          wsSend({ type: "register", payload: { url: event.url } })
          this.impl.manager.notice.set("滑动验证地址", String(this.impl.config.slider))
        }
        ws.onmessage = async msg => {
          try {
            const data = JSON.parse(msg.data)
            this.impl.logger.debug([`收到 ${data.payload.ticket}`, data])
            switch (data.type) {
              case "ticket":
                ticket = data.payload.ticket
                fnc.close()
                break
              case "handle": {
                const { url, ...opts } = data.payload
                const req = await fetch(url, opts)
                data.payload = {
                  result: Buffer.from(await req.arrayBuffer()).toString("base64"),
                  headers: Object.fromEntries(req.headers.entries()),
                }
                wsSend(data)
                break
              }
              default:
                this.impl.logger.info(data)
            }
          } catch (err) {
            this.impl.logger.error(err)
          }
        }
        break
      }
      case "2": {
        await fetch(this.impl.config.slider, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: event.url }),
        })
        this.impl.manager.notice.set("滑动验证地址", String(this.impl.config.slider))

        fnc.ticket = async () => {
          const res = await (
            await fetch(this.impl.config.slider, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ submit: this.impl.config.uin }),
            })
          ).json()
          return res.data?.ticket
        }
        break
      }
      default:
        return this.impl.client.submitSlider(msg)
    }
    try {
      for (let i = 0; i < 60; i++) {
        await setTimeout(3000)
        const ticket = await fnc.ticket()
        if (ticket) return this.impl.client.submitSlider(ticket)
      }
    } catch (err) {
      this.impl.logger.error(err)
      return this.impl.manager.notice.set("登录错误", "滑动验证错误")
    }
    if (fnc.close) fnc.close()
    return this.impl.manager.notice.set("登录错误", "滑动验证超时")
  }

  "system.login.device"(event: EventParam<"system.login.device">) {
    this.impl.manager.notice.set(
      "设备锁验证",
      `请选择设备锁验证方式\n短信验证：输入1\n扫码验证：扫码完成后，输入2\n${event.url}`,
      msg => {
        this.handleLoginDevice(msg)
      },
      true,
    )
  }

  "system.login.auth"(event: EventParam<"system.login.auth">) {
    this.impl.manager.notice.set("身份验证", `请完成身份验证后，继续登录\n${event.url}`, () => {
      this.impl.client.login()
    })
  }

  "system.login.error"(event: EventParam<"system.login.error">) {
    this.impl.manager.notice.set("登录错误", `${event.message}(${event.code})\n`)
  }

  "system.offline"(event: EventParam<"system.offline">) {
    this.impl.manager.notice.set("账号下线", event.message)
    return this.impl.philia.stop()
  }

  "system.online"() {
    return this.impl.philia.start()
  }

  async PrivateMessage(data: icqq.PrivateMessage) {
    const message = await new Message.ICQQtoPhilia(this.impl, data).convert()
    const event: Philia.Event.UserMessage = {
      raw: { ...data },
      id: data.message_id,
      type: "message",
      time: data.time,
      scene: "user",
      user: this.impl.handle._convertUserInfo(data.sender),
      message: message.after,
      summary: message.summary,
    }
    if (data.from_id === this.impl.client.uin) event.is_self = true
    return event
  }
  async "message.private"(event: EventParam<"message.private">) {
    return this.impl.event_handle.handle(await this.PrivateMessage(event))
  }

  async GroupMessage(data: icqq.GroupMessage) {
    const message = await new Message.ICQQtoPhilia(this.impl, data).convert()
    const event: Philia.Event.GroupMessage = {
      raw: { ...data },
      id: data.message_id,
      type: "message",
      time: data.time,
      scene: "group",
      user: await this.impl.handle.getGroupMemberInfo({
        id: String(data.group_id),
        uid: String(data.sender.user_id),
      }),
      group: await this.impl.handle.getGroupInfo({ id: String(data.group_id) }),
      message: message.after,
      summary: message.summary,
    }
    return event
  }
  async "message.group"(event: EventParam<"message.group">) {
    return this.impl.event_handle.handle(await this.GroupMessage(event))
  }

  async Message(data: icqq.PrivateMessage | icqq.GroupMessage) {
    return this[`${data.message_type === "private" ? "Private" : "Group"}Message`](data as never)
  }

  async ForwardMessage(data: icqq.ForwardMessage) {
    const message = await new Message.ICQQtoPhilia(this.impl, data).convert()
    const event: Philia.Message.Forward = {
      message: message.after,
      summary: message.summary,
      time: data.time,
      user: { name: data.nickname },
    }
    return event
  }

  async FriendRequest(data: EventParam<"request.friend">) {
    const event: Philia.Event.UserRequest = {
      raw: { ...data },
      id: `friend|${data.flag}`,
      type: "request",
      time: data.time,
      scene: `user_${data.sub_type as "add"}`,
      user: await this.impl.handle.getUserInfo({ id: String(data.user_id) }),
      state: "pending",
      reason: data.comment,
    }
    return event
  }
  async "request.friend"(event: EventParam<"request.friend">) {
    return this.impl.event_handle.handle(await this.FriendRequest(event))
  }

  async GroupRequest(data: EventParam<"request.group">) {
    const event: Philia.Event.GroupRequest = {
      raw: { ...data },
      id: `group|${data.flag}`,
      type: "request",
      time: data.time,
      scene: `group_${data.sub_type}`,
      user: await this.impl.handle.getUserInfo({ id: String(data.user_id) }),
      group: await this.impl.handle.getGroupInfo({ id: String(data.group_id) }),
      state: "pending",
    }

    if (data.sub_type === "add") {
      if (data.comment) event.reason = data.comment
      if (data.inviter_id) {
        event.target = await this.impl.handle.getUserInfo({ id: String(data.user_id) })
        event.user = await this.impl.handle.getUserInfo({ id: String(data.inviter_id) })
      }
    }

    return event
  }
  async "request.group"(event: EventParam<"request.group">) {
    return this.impl.event_handle.handle(await this.GroupRequest(event))
  }
}
