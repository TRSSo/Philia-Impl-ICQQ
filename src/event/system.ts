import { setTimeout } from "node:timers/promises"
import type icqq from "icqq"
import type { Project } from "../impl.js"

const listener: Pick<
  icqq.EventMap,
  | "system.login.qrcode"
  | "system.login.slider"
  | "system.login.device"
  | "system.login.auth"
  | "system.login.error"
  | "system.offline"
  | "system.online"
> = {
  async "system.login.qrcode"(this: Project, event) {
    this.manager.notice.set("扫码登录", `扫码登录：${event.image}`)
    for (;;) {
      await setTimeout(3000)
      const { retcode } = await this.client.queryQrcodeResult()
      switch (retcode) {
        case 0:
          return this.client.qrcodeLogin()
        case 17:
          return this.manager.notice.set("登录错误", "二维码已过期")
        case 54:
          return this.manager.notice.set("登录错误", "扫码登录取消")
      }
    }
  },
  "system.login.slider"(this: Project, event) {
    this.manager.notice.set(
      "滑动验证",
      `Bot 与浏览器处于同一网络下推荐网页，否则网页反代\n` +
        `网页反代验证：输入1\n` +
        `网页验证：输入2\n` +
        `手动验证：输入得到的ticket\n` +
        event.url,
      msg => {
        handleLoginSlider.call(this, event, msg)
      },
      true,
    )
  },
  "system.login.device"(this: Project, event) {
    this.manager.notice.set(
      "设备锁验证",
      `请选择设备锁验证方式\n短信验证：输入1\n扫码验证：扫码完成后，输入2\n${event.url}`,
      msg => {
        handleLoginDevice.call(this, msg)
      },
      true,
    )
  },
  "system.login.auth"(this: Project, event) {
    this.manager.notice.set("身份验证", `请完成身份验证后，继续登录\n${event.url}`, () => {
      this.client.login()
    })
  },
  "system.login.error"(this: Project, event) {
    this.manager.notice.set("登录错误", `${event.message}(${event.code})\n`)
  },
  "system.offline"(this: Project, event) {
    this.manager.notice.set("账号下线", event.message)
    return this.philia.stop()
  },
  "system.online"(this: Project) {
    return this.philia.start()
  },
}
export default listener

async function handleLoginDevice(this: Project, msg: string) {
  if (msg === "1") {
    await this.client.sendSmsCode()
    this.manager.notice.set(
      "短信验证",
      "短信已发送，请输入验证码",
      msg => {
        this.client.submitSmsCode(msg)
      },
      true,
    )
  } else this.client.login()
}

async function handleLoginSlider(
  this: Project,
  event: Parameters<icqq.EventMap["system.login.slider"]>[0],
  msg: string,
) {
  const fnc = {} as { ticket: () => string | Promise<string>; close: () => void }
  switch (msg) {
    case "1": {
      const ws = new WebSocket(this.config.slider)
      const wsSend = (data: object) => {
        this.logger.debug(`发送 ${this.config.slider}`, data)
        ws.send(JSON.stringify(data))
      }
      let ticket: string | Error
      fnc.ticket = () => {
        if (ticket instanceof Error) throw ticket
        return ticket
      }
      fnc.close = ws.close.bind(ws)
      ws.onclose = () => {
        this.logger.debug(`连接关闭 ${this.config.slider}`)
        ticket ??= Error(`连接关闭 ${this.config.slider}`)
      }
      ws.onerror = error => {
        this.logger.debug(`连接错误 ${this.config.slider}`, error)
        ticket ??= Error(`连接错误 ${this.config.slider}`, { cause: error })
        fnc.close()
      }
      ws.onopen = () => {
        wsSend({ type: "register", payload: { url: event.url } })
        this.manager.notice.set("滑动验证地址", String(this.config.slider))
      }
      ws.onmessage = async msg => {
        try {
          const data = JSON.parse(msg.data)
          this.logger.debug([`收到 ${data.payload.ticket}`, data])
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
              this.logger.info(data)
          }
        } catch (err) {
          this.logger.error(err)
        }
      }
      break
    }
    case "2": {
      await fetch(this.config.slider, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: event.url }),
      })
      this.manager.notice.set("滑动验证地址", String(this.config.slider))

      fnc.ticket = async () => {
        const res = await (
          await fetch(this.config.slider, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submit: this.config.uin }),
          })
        ).json()
        return res.data?.ticket
      }
      break
    }
    default:
      return this.client.submitSlider(msg)
  }
  try {
    for (let i = 0; i < 60; i++) {
      await setTimeout(3000)
      const ticket = await fnc.ticket()
      if (ticket) return this.client.submitSlider(ticket)
    }
  } catch (err) {
    this.logger.error(err)
    return this.manager.notice.set("登录错误", "滑动验证错误")
  }
  if (fnc.close) fnc.close()
  return this.manager.notice.set("登录错误", "滑动验证超时")
}
