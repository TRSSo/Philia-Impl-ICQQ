import type icqq from "icqq"
import type { API, Contact, Event, Message } from "philia/protocol/type"
import type { Project as Impl } from "#impl.js"
import * as MessageConverter from "./message.js"

function throwBool(name = "操作") {
  return (b: boolean) => {
    if (b === false) throw Error(`$${name}失败`)
  }
}

export type IAPI = API.API & API.IAPI<API.OICQ>
export default class ICQQtoPhilia implements IAPI {
  constructor(public impl: Impl) {}

  receiveEvent(
    { event }: API.Req<"receiveEvent">,
    client?: Parameters<typeof this.impl.event_handle.receive>[1],
  ) {
    return this.impl.event_handle.receive(event, client!)
  }
  unreceiveEvent(
    { event }: API.Req<"unreceiveEvent">,
    client?: Parameters<typeof this.impl.event_handle.unreceive>[1],
  ) {
    return this.impl.event_handle.unreceive(event, client!)
  }

  getSelfInfo() {
    return {
      id: String(this.impl.client.uin),
      name: this.impl.client.nickname,
      avatar: this.impl.client.pickUser(this.impl.client.uin).getAvatarUrl(),
    }
  }

  async setSelfInfo({ data }: API.Req<"setSelfInfo">) {
    if (data.name) await this.impl.client.setNickname(data.name)
    if (data.avatar) await this.impl.client.setAvatar(data.avatar)
  }

  _convertUserInfo(res: { user_id: number; nickname: string }): Contact.User {
    return {
      avatar: this.impl.client.pickUser(res.user_id).getAvatarUrl(),
      ...res,
      id: String(res.user_id),
      name: res.nickname,
    }
  }

  async getUserInfo({ id }: API.Req<"getUserInfo">) {
    const friend = this.impl.client.pickFriend(+id)
    return this._convertUserInfo(friend.info ?? (await friend.getSimpleInfo()))
  }

  _convertGroupInfo(res: icqq.GroupInfo): Contact.Group {
    return {
      avatar: this.impl.client.pickGroup(res.group_id).getAvatarUrl(),
      ...res,
      id: String(res.group_id),
      name: res.group_name,
      whole_mute: res.shutup_time_whole > 0,
    }
  }

  async getGroupInfo({ id, refresh }: API.Req<"getGroupInfo">) {
    const group = await this.impl.client.pickGroup(+id)
    let res = group.info
    if (!res || refresh) res = await group.renew()
    return this._convertGroupInfo(res)
  }

  _convertGroupMemberInfo(res: icqq.MemberInfo): Contact.GroupMember {
    return {
      avatar: this.impl.client.pickMember(res.group_id, res.user_id).getAvatarUrl(),
      ...res,
      id: String(res.user_id),
      name: res.nickname,
      mute_time: res.shutup_time,
    }
  }

  async getGroupMemberInfo({ id, uid, refresh }: API.Req<"getGroupMemberInfo">) {
    const member = await this.impl.client.pickMember(+id, +uid)
    let res = member.info
    if (!res || refresh) res = await member.renew()
    return this._convertGroupMemberInfo(res)
  }

  async setInfo({ scene, id, data }: API.Req<"setInfo">) {
    switch (scene) {
      case "user": {
        const friend = this.impl.client.pickFriend(+id, true)
        if (data.remark !== undefined) await friend.setRemark(data.remark)
        break
      }
      case "group": {
        const group = this.impl.client.pickGroup(+id, true)
        if (data.name !== undefined) await group.setName(data.name).then(throwBool("设置群名"))
        if (data.avatar !== undefined) await group.setAvatar(data.avatar)
        if (data.remark !== undefined) await group.setRemark(data.remark)
        if (data.whole_mute !== undefined)
          await group.muteAll((data as Contact.Group).whole_mute).then(throwBool("设置群全员禁言"))
        break
      }
    }
  }

  async setGroupMemberInfo({ id, uid, data }: API.Req<"setGroupMemberInfo">) {
    const member = this.impl.client.pickMember(+id, +uid, true)
    if (data.card !== undefined) await member.setCard(data.card)
    if (data.title !== undefined) await member.setTitle(data.title)
    if (data.role !== undefined) await member.setAdmin(data.role === "admin")
    if (data.mute_time !== undefined) await member.mute(data.mute_time)
  }

  delUser({ id, block }: API.Req<"delUser">) {
    return this.impl.client
      .pickFriend(+id)
      .delete(block === true)
      .then(throwBool("删除好友"))
  }

  async delGroup({ id, dismiss }: API.Req<"delGroup">) {
    if (!dismiss) {
      if (
        (await this.getGroupMemberInfo({ id, uid: (await this.getSelfInfo()).id })).role === "owner"
      )
        return
    }
    return this.impl.client.pickGroup(+id).quit().then(throwBool("退出群"))
  }

  delGroupMember({ id, uid, block }: API.Req<"delGroupMember">) {
    return this.impl.client
      .pickMember(+id, +uid)
      .kick(undefined, block)
      .then(throwBool("删除群成员"))
  }

  async sendMsg({ scene, id, data }: API.Req<"sendMsg">) {
    const message = await new MessageConverter.PhiliaToICQQ(this.impl, scene, id, data).convert()
    if (!message.after.length) {
      if (!message.summary) throw new Error("空消息")
      return {
        id: "",
        time: Math.floor(Date.now() / 1000),
      }
    }
    const res = await (scene === "user"
      ? this.impl.client.pickUser(+id).sendMsg(message.after)
      : this.impl.client.pickGroup(+id).sendMsg(message.after))
    const ret: Message.RSendMsg = {
      time: res.time ?? Math.floor(Date.now() / 1000),
      id: res.message_id,
      raw: res as unknown as undefined,
    }
    if (message.file_id) ret.file_id = message.file_id
    return ret
  }

  async sendMultiMsg({ scene, id, data }: API.Req<"sendMultiMsg">) {
    const messages: icqq.Forwardable[] = []
    for (const i of data) {
      const message = await new MessageConverter.PhiliaToICQQ(
        this.impl,
        scene,
        id,
        i.message,
      ).convert()
      if (!message.after.length) continue
      messages.push({
        user_id: Number(i.user?.id) || 80000000,
        nickname: i.user?.name || "匿名消息",
        message: message.after,
        time: i.time,
      })
    }
    if (!messages.length) return [{ id: "", time: Math.floor(Date.now() / 1000) }]
    const res = await (scene === "user"
      ? this.impl.client.pickUser(+id).makeForwardMsg(messages)
      : this.impl.client.pickGroup(+id).makeForwardMsg(messages))
    const ret = await this.sendMsg({
      scene,
      id,
      data: { type: "platform", mode: "include", list: "ICQQ", data: res },
    })
    return [ret]
  }

  async _sendFile({ scene, id, data }: API.Req<"_sendFile">) {
    let file: string | Buffer | undefined
    switch (data.data) {
      case "id":
        /** 获取文件下载链接 */
        break
      case "path":
      case "binary":
      case "url":
        file = data[data.data]!
        break
    }
    if (!file) throw Error("获取文件错误")
    const res = await (scene === "user"
      ? this.impl.client.pickFriend(+id).sendFile(file)
      : (await this.impl.client.pickGroup(+id).sendFile(file)).fid)
    return res
  }

  async getMsg({ id }: API.Req<"getMsg">) {
    const res = await this.impl.client.getMsg(id)
    if (!res) throw Error("获取消息失败")
    return this.impl.event.Message(res)
  }

  delMsg({ id }: API.Req<"delMsg">) {
    return this.impl.client.deleteMsg(id).then(throwBool("撤回消息"))
  }

  async sendMsgForward({ scene, id, mid }: API.Req<"sendMsgForward">) {
    const event = await this.impl.client.getMsg(mid)
    if (!event?.message) throw Error("获取消息错误")
    return this.sendMsg({
      scene,
      id,
      data: { type: "platform", mode: "include", list: "ICQQ", data: event.message },
    })
  }

  getFile({ id }: API.Req<"getFile">) {
    /** TODO: 获取文件 */
    return { id } as Message.URLFile
  }

  async getChatHistory({ type, id, count, newer }: API.Req<"getChatHistory">) {
    let res: (icqq.PrivateMessage | icqq.GroupMessage)[] = []
    switch (type) {
      case "message":
        if (newer) {
          // TODO: 向后获取
        } else res = await this.impl.client.getChatHistory(id, count)
        break
      case "user":
        res = await this.impl.client.pickUser(+id).getChatHistory(undefined, count)
        break
      case "group":
        res = await this.impl.client.pickGroup(+id).getChatHistory(undefined, count)
        break
    }
    return Promise.all(res.map(this.impl.event.Message.bind(this.impl.event)))
  }

  async getUserList({ refresh }: API.Req<"getUserList"> = {}) {
    if (refresh) await this.impl.client.reloadFriendList()
    return Array.from(this.impl.client.fl.keys()).map(i => String(i))
  }
  async getUserArray({ refresh }: API.Req<"getUserArray"> = {}) {
    if (refresh) await this.impl.client.reloadFriendList()
    return Array.from(this.impl.client.fl.values()).map(this._convertUserInfo.bind(this))
  }

  async getGroupList({ refresh }: API.Req<"getGroupList"> = {}) {
    if (refresh) await this.impl.client.reloadGroupList()
    return Array.from(this.impl.client.gl.keys()).map(i => String(i))
  }
  async getGroupArray({ refresh }: API.Req<"getGroupArray"> = {}) {
    if (refresh) await this.impl.client.reloadGroupList()
    return Array.from(this.impl.client.gl.values()).map(this._convertGroupInfo.bind(this))
  }

  async getGroupMemberList({ id, refresh }: API.Req<"getGroupMemberList">) {
    return Array.from((await this.impl.client.pickGroup(+id).getMemberMap(refresh)).keys()).map(i =>
      String(i),
    )
  }
  async getGroupMemberArray({ id, refresh }: API.Req<"getGroupMemberArray">) {
    return Array.from((await this.impl.client.pickGroup(+id).getMemberMap(refresh)).values()).map(
      this._convertGroupMemberInfo.bind(this),
    )
  }

  async getRequestArray({ scene, count }: API.Req<"getRequestArray"> = {}) {
    const ret: Promise<Event.Request>[] = []
    for (const i of await this.impl.client.getSystemMsg()) {
      if (i.request_type === "friend") {
        if (scene && scene !== "user_add") continue
        ret.push(this.impl.event.FriendRequest(i))
      } else if (i.sub_type === "add") {
        if (scene && scene !== "group_add") continue
        ret.push(this.impl.event.GroupRequest(i))
      } else {
        if (scene && scene !== "group_invite") continue
        ret.push(this.impl.event.GroupRequest(i))
      }
      if (count && ret.length === count) break
    }
    return Promise.all(ret)
  }

  async setRequest({ id, result, reason }: API.Req<"setRequest">) {
    if (id.startsWith("friend|"))
      return this.impl.client
        .setFriendAddRequest(id.replace("friend|", ""), result)
        .then(throwBool("处理好友请求"))
    else if (id.startsWith("group|"))
      return this.impl.client
        .setGroupAddRequest(id.replace("group|", ""), result, reason)
        .then(throwBool("处理群请求"))
  }

  uploadCacheFile(): string {
    throw Error("暂不支持")
  }
  clearCache() {}

  async getForwardMsg({ id }: API.Req<"getForwardMsg">) {
    const res = await this.impl.client.getForwardMsg(id)
    return Promise.all(res.map(this.impl.event.ForwardMessage.bind(this.impl.event)))
  }

  sendPoke({ scene, id, tid }: API.Req<"sendPoke">) {
    return (
      scene === "user"
        ? this.impl.client.pickFriend(+id).poke(+tid === this.impl.client.uin)
        : this.impl.client.pickMember(+id, +tid).poke()
    ).then(throwBool("发送戳一戳"))
  }

  getGroupAnnounceList() {
    return []
  }
  sendGroupAnnounce({ id, content }: API.Req<"sendGroupAnnounce">) {
    return this.impl.client.pickGroup(+id).announce(content).then(throwBool("群公告"))
  }
  delGroupAnnounce() {}

  writeUni(args: API.Req<"writeUni">) {
    return (this.impl.client.writeUni as any)(...args)
  }
  sendOidb(args: API.Req<"sendOidb">) {
    return (this.impl.client.sendOidb as any)(...args)
  }
  sendPacket(args: API.Req<"sendPacket">) {
    return (this.impl.client.sendPacket as any)(...args)
  }
  sendUni(args: API.Req<"sendUni">) {
    return (this.impl.client.sendUni as any)(...args)
  }
  sendOidbSvcTrpcTcp(args: API.Req<"sendOidbSvcTrpcTcp">) {
    return (this.impl.client.sendOidbSvcTrpcTcp as any)(...args)
  }

  getRoamingStamp({ refresh }: API.Req<"getRoamingStamp"> = {}) {
    return this.impl.client.getRoamingStamp(refresh)
  }
  delRoamingStamp({ id }: API.Req<"delRoamingStamp">) {
    return this.impl.client.deleteStamp(id)
  }
  setUserClass({ name, id }: API.Req<"setUserClass">) {
    return this.impl.client.pickFriend(+id).setClass(name as number)
  }
  addUserClass({ name }: API.Req<"addUserClass">) {
    return this.impl.client.addClass(name)
  }
  delUserClass({ name }: API.Req<"delUserClass">) {
    return this.impl.client.deleteClass(name as number)
  }
  renameUserClass({ name, new_name }: API.Req<"renameUserClass">) {
    return this.impl.client.renameClass(name as number, new_name)
  }
  getImageOCR({ image }: API.Req<"getImageOCR">) {
    return this.impl.client.imageOcr(image[image.data]!)
  }
  getSelfCookie({ domain }: API.Req<"getSelfCookie"> = {}) {
    if (domain) return this.impl.client.cookies[domain as ""]
    return Object.fromEntries(Object.entries(this.impl.client.cookies))
  }
  getSelfCSRFToken() {
    return this.impl.client.bkn
  }
  sendUserLike({ id, times }: API.Req<"sendUserLike">) {
    return this.impl.client.pickFriend(+id).thumbUp(times).then(throwBool("资料卡点赞"))
  }
  addUserBack({ id, seq, remark }: API.Req<"addUserBack">) {
    return this.impl.client.pickFriend(+id).addFriendBack(seq, remark).then(throwBool("添加好友"))
  }
  async searchUserSameGroup({ id }: API.Req<"searchUserSameGroup">) {
    const res = await this.impl.client.pickFriend(+id).searchSameGroup()
    return res.map((i: { groupName: string; Group_Id: number }) =>
      this.impl.handle.getGroupInfo({ id: String(i.Group_Id) }),
    )
  }

  getGroupFSDf({ id }: API.Req<"getGroupFSDf">) {
    return this.impl.client.pickGroup(+id).fs.df()
  }
  getGroupFSStat({ id, fid }: API.Req<"getGroupFSStat">) {
    return this.impl.client.pickGroup(+id).fs.stat(fid)
  }
  getGroupFSDir({ id, pid, start, limit }: API.Req<"getGroupFSDir">) {
    return this.impl.client.pickGroup(+id).fs.dir(pid, start, limit)
  }
  addGroupFSDir({ id, name }: API.Req<"addGroupFSDir">) {
    return this.impl.client.pickGroup(+id).fs.mkdir(name)
  }
  delGroupFSFile({ id, fid }: API.Req<"delGroupFSFile">) {
    return this.impl.client.pickGroup(+id).fs.rm(fid)
  }
  renameGroupFSFile({ id, fid, name }: API.Req<"renameGroupFSFile">) {
    return this.impl.client.pickGroup(+id).fs.rename(fid, name)
  }
  moveGroupFSFile({ id, fid, pid }: API.Req<"moveGroupFSFile">) {
    return this.impl.client.pickGroup(+id).fs.mv(fid, pid)
  }
  uploadGroupFSFile({ id, file, pid, name }: API.Req<"uploadGroupFSFile">) {
    return this.impl.client.pickGroup(+id).fs.upload(file, pid, name)
  }
  forwardGroupFSFile({ id, fid, pid, name }: API.Req<"forwardGroupFSFile">) {
    if (typeof fid === "string") fid = this.getGroupFSStat({ id, fid })
    return this.impl.client.pickGroup(+id).fs.forward(fid as icqq.GfsFileStat, pid, name)
  }
  getGroupFSFile({ id, fid }: API.Req<"getGroupFSFile">) {
    return this.impl.client.pickGroup(+id).fs.download(fid)
  }

  async addGroupEssence({ id, seq, rand }: API.Req<"addGroupEssence">) {
    if (!seq) {
      const res = await this.impl.client.getMsg(id)
      if (!res) throw Error("获取消息失败")
      seq = res.seq
      rand = res.rand
    }
    await this.impl.client.pickGroup(+id).addEssence(seq, rand!)
  }
  async delGroupEssence({ id, seq, rand }: API.Req<"delGroupEssence">) {
    if (!seq) {
      const res = await this.impl.client.getMsg(id)
      if (!res) throw Error("获取消息失败")
      seq = res.seq
      rand = res.rand
    }
    await this.impl.client.pickGroup(+id).removeEssence(seq, rand!)
  }
  setReaded({ id, seq, time }: API.Req<"setReaded">) {
    if (typeof seq === "number") return this.impl.client.pickGroup(+id).markRead(seq)
    else if (time) return this.impl.client.pickFriend(+id).markRead(time)
    return this.impl.client.reportReaded(id)
  }
  setMessageRate({ id, times }: API.Req<"setMessageRate">) {
    return this.impl.client
      .pickGroup(+id)
      .setMessageRateLimit(times)
      .then(throwBool("设置消息频率"))
  }
  setGroupJoinType({ id, type, question, answer }: API.Req<"setGroupJoinType">) {
    return (
      this.impl.client.pickGroup(+id).setGroupJoinType(type, question, answer)
        .then as Promise<boolean>["then"]
    )(throwBool("设置入群方式"))
  }
  getGroupAtAllRemainder({ id }: API.Req<"getGroupAtAllRemainder">) {
    return this.impl.client.pickGroup(+id).getAtAllRemainder()
  }
  sendGroupUserInvite({ id, uid }: API.Req<"sendGroupUserInvite">) {
    return this.impl.client.pickGroup(+id).invite(+uid).then(throwBool("邀请好友入群"))
  }
  sendGroupSign({ id }: API.Req<"sendGroupSign">) {
    return this.impl.client.pickGroup(+id).sign() as unknown as Promise<void>
  }
  async _getReactionType(data: API.Req<"setReaction"> | API.Req<"delReaction">) {
    const res = await this.impl.client.getMsg(data.id)
    if (!res) throw Error("获取消息失败")
    data.seq = res.seq
    if (res.message_type === "private") {
      data.type = "user"
      data.id = String(res.sender.user_id)
    } else {
      data.type = "group"
      data.id = String(res.group_id)
    }
  }
  async setReaction(data: API.Req<"setReaction">) {
    if (data.type === "message") await this._getReactionType(data)
    if (data.type === "group")
      return this.impl.client.pickGroup(+data.id).setReaction(data.seq!, data.eid, data.etype)
  }
  async delReaction(data: API.Req<"delReaction">) {
    if (data.type === "message") await this._getReactionType(data)
    if (data.type === "group")
      return this.impl.client.pickGroup(+data.id).delReaction(data.seq!, data.eid, data.etype)
  }
}
