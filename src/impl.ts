import { setTimeout } from "node:timers/promises"
import * as inquirer from "@inquirer/prompts"
import icqq from "icqq"
import { makeLogger } from "philia/logger"
import * as Common from "philia/project/project/common.js"
import * as Philia from "philia/project/project/philia.js"
import { selectArray } from "philia/util/tui.js"

export interface IConfig extends Common.IConfig {
  name: "ICQQ"
  uin: number
  passwd: string
  config: icqq.Config
  slider: string | URL
}

export class Project extends Common.Project {
  declare config: IConfig
  client: icqq.Client
  philia: Philia.Project

  constructor(config: IConfig) {
    super(config)
    this.philia = new Philia.Project(config.philia)
    this.client = new icqq.Client({ data_dir: `data/${config.uin}`, ...config.config })
    this.client.logger = makeLogger("ICQQ")
    for (const i in Project.listener)
      this.client.on(i, Project.listener[i as keyof typeof Project.listener]!.bind(this))
  }

  static async createConfig(name: IConfig["name"]) {
    const config = {
      name,
      config: {},
      philia: await Philia.Project.createConfig(),
      slider: "https://GT.928100.xyz/captcha/slider",
    } as IConfig
    await Project.editConfig(config)
    return config
  }

  static edit_config_key: [keyof icqq.Config, string, "string" | "number" | "boolean"][] = [
    ["platform", "设备", "number"],
    ["ver", "版本", "string"],
    ["sign_api_addr", "签名服务器地址", "string"],
    ["ignore_self", "过滤自己的消息", "boolean"],
    ["cache_group_member", "缓存群成员列表", "boolean"],
    ["resend", "风控时分片发送", "boolean"],
    ["reconn_interval", "重新登录间隔", "number"],
    ["ffmpeg_path", "FFmpeg 路径", "string"],
    ["ffprobe_path", "FFprobe 路径", "string"],
    ["auto_server", "自动选择最优服务器", "boolean"],
  ]
  static async editConfig(config: IConfig) {
    for (;;) {
      const choose = await inquirer.select({
        message: "请选择要修改的配置项",
        choices: [
          { value: "done", name: "✅  完成" } as const,
          ...selectArray(
            [
              ["uin", "QQ号"],
              ["passwd", "密码"],
              ...(Project.edit_config_key as unknown as [keyof icqq.Config, string][]),
              ["slider", "滑动验证代理"],
            ] as const,
            [
              config.uin as unknown as string,
              "*".repeat(config.passwd?.length),
              ...Project.edit_config_key.map(x =>
                config.config[x[0]] === undefined
                  ? (undefined as unknown as string)
                  : String(config.config[x[0]]),
              ),
              config.slider as string,
            ],
          ),
        ],
      })

      switch (choose) {
        case "platform":
          config.config.platform = await inquirer.select({
            message: "请选择登录设备",
            choices: selectArray<icqq.Platform>([
              [icqq.Platform.Android, "手机"],
              [icqq.Platform.aPad, "平板"],
              [icqq.Platform.Watch, "手表"],
              [icqq.Platform.iMac, "iMac"],
              [icqq.Platform.Tim, "TIM"],
              [icqq.Platform.Custom, "自定义"],
            ]),
          })
          break
        case "uin":
          config.uin = await inquirer.number({
            message: "请输入QQ号",
            required: true,
            min: 10000,
            max: 2 ** 32 - 1,
          })
          break
        case "passwd":
          config.passwd = await inquirer.password({ message: "请输入密码" })
          break
        case "slider":
          config.slider = await inquirer.input({
            message: "请输入滑动验证代理",
            default: String(config.slider),
            required: true,
            validate(input) {
              try {
                new URL(input)
              } catch {
                return "请输入正确的URL"
              }
              return true
            },
          })

          break
        case "done":
          return
        default: {
          const type = Project.edit_config_key.find(i => i[0] === choose)?.[2]
          if (type === "boolean") {
            config.config[choose] = (await inquirer.confirm({
              message: `请输入 ${choose}：`,
              default: config.config[choose] as undefined,
            })) as unknown as undefined
          } else {
            const input = await (type === "string" ? inquirer.input : inquirer.number)({
              message: `请输入 ${choose}：`,
              default: config.config[choose] as undefined,
            })
            if (input === "" || input === undefined) delete config.config[choose]
            else config.config[choose] = input as unknown as undefined
          }
        }
      }
    }
  }

  verifyConfig() {
    if (
      typeof this.config.uin !== "number" ||
      this.config.uin < 10000 ||
      this.config.uin >= 2 ** 32
    )
      throw TypeError("请输入正确的QQ号")
    try {
      this.config.slider = new URL(this.config.slider)
      this.config.slider.searchParams.set("key", String(this.config.uin))
    } catch (err) {
      throw TypeError("滑动验证代理地址格式错误", { cause: err })
    }
  }

  static listener: Partial<icqq.EventMap> = {
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
        `Bot 与浏览器处于同一网络下推荐网页，否则网页反代\n\n` +
          `网页反代验证：网页反代\n` +
          `网页验证：网页\n` +
          `手动验证：ticket\n` +
          event.url,
        msg => {
          this.handleLoginSlider(event, msg)
        },
      )
    },
    "system.login.device"(this: Project, event) {
      this.manager.notice.set(
        "设备锁验证",
        `请选择设备锁验证方式\n` +
          `短信验证：输入短信\n` +
          `扫码验证：扫码完成后，继续登录\n` +
          event.url,
        msg => {
          this.handleLoginDevice(msg)
        },
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

  async handleLoginDevice(msg: string) {
    if (msg === "短信") {
      await this.client.sendSmsCode()
      this.manager.notice.set("短信验证", "短信已发送，请输入验证码", msg => {
        this.client.submitSmsCode(msg)
      })
    } else this.client.login()
  }

  async handleLoginSlider(event: Parameters<icqq.EventMap["system.login.slider"]>[0], msg: string) {
    const fnc = {} as { ticket: () => string | Promise<string>; close: () => void }
    switch (msg) {
      case "网页反代": {
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
      case "网页": {
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

  start() {
    return this.client.login(this.config.uin, this.config.passwd)
  }

  stop() {
    return Promise.allSettled([this.client.logout(), this.philia.stop()])
  }
}
