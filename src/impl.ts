import * as inquirer from "@inquirer/prompts"
import icqq from "icqq"
import { makeLogger } from "philia/logger"
import * as Common from "philia/project/project/common.js"
import * as Philia from "philia/project/project/philia.js"
import { selectArray } from "philia/util/tui.js"
import Event from "./event/index.js"

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
    for (const i in Event) this.client.on(i, Event[i as keyof typeof Event].bind(this))
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

  start() {
    return this.client.login(this.config.uin, this.config.passwd)
  }

  stop() {
    return Promise.allSettled([this.client.logout(), this.philia.stop()])
  }
}
