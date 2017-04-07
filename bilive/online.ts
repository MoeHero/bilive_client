import * as request from 'request'
import * as tools from './lib/tools'
import { EventEmitter } from 'events'
import { AppClient } from './lib/app_client'
import { DeCaptcha } from './lib/boxcaptcha'
import { usersData, userData, rootOrigin, options, cookieJar } from './index'
/**
 * 挂机得经验
 * 
 * @export
 * @class Online
 * @extends {EventEmitter}
 */
export class Online extends EventEmitter {
  constructor() {
    super()
  }
  /**
   * 开始挂机
   * 
   * @memberOf Online
   */
  public Start() {
    this.DoLoop()
    this.OnlineHeart()
  }
  /**
   * 发送在线心跳包, 检查cookie是否失效
   * 
   * @memberOf Online
   */
  public OnlineHeart() {
    let roomID = options.defaultRoomID,
      usersData = options.usersData
    for (let uid in usersData) {
      let userData = usersData[uid]
      if (userData.status) {
        // PC
        let online = {
          method: 'POST',
          uri: `${rootOrigin}/User/userOnlineHeart`,
          jar: cookieJar[uid]
        }
        tools.XHR<string>(online)
          .then((resolve) => {
            let userOnlineHeartResponse: userOnlineHeartResponse = JSON.parse(resolve)
            if (userOnlineHeartResponse.code === -101) this.emit('cookieError', uid)
          })
          .catch((reject) => { tools.Log(userData.nickname, reject) })
        // 客户端
        let heartbeatQuery = `access_key=${userData.accessToken}&${AppClient.baseQuery}`,
          heartbeat = {
            method: 'POST',
            uri: `${rootOrigin}/mobile/userOnlineHeart?${AppClient.ParamsSign(heartbeatQuery)}`,
            body: `room_id=${roomID}&scale=xxhdpi&`
          }
        tools.XHR<string>(heartbeat)
          .then((resolve) => {
            let userOnlineHeartResponse: userOnlineHeartResponse = JSON.parse(resolve)
            if (userOnlineHeartResponse.code === -101) this.emit('tokenError', uid)
          })
          .catch((reject) => { tools.Log(userData.nickname, reject) })
      }
    }
    setTimeout(() => {
      this.OnlineHeart()
    }, 3e5) // 5分钟
  }
  /**
   * 八小时循环, 用于签到, 宝箱, 日常活动
   * 
   * @memberOf Online
   */
  public DoLoop() {
    let eventRooms = options.eventRooms,
      usersData = options.usersData
    for (let uid in usersData) {
      let userData = usersData[uid]
      // 每日签到
      if (userData.status && userData.doSign) this._DoSign(uid)
      // 每日宝箱
      if (userData.status && userData.treasureBox) this._TreasureBox(uid)
      // 日常活动
      if (userData.status && userData.eventRoom && eventRooms.length > 0) this._EventRoom(uid, eventRooms)
    }
    setTimeout(() => {
      this.DoLoop()
    }, 288e5) // 8小时
  }
  /**
   * 每日签到
   * 
   * @private
   * @param {string} uid
   * @memberOf Online
   */
  private _DoSign(uid: string) {
    let userData = options.usersData[uid],
      signQuery = `access_key=${userData.accessToken}&${AppClient.baseQuery}`,
      sign: request.Options = { uri: `${rootOrigin}/AppUser/getSignInfo?${AppClient.ParamsSign(signQuery)}` }
    tools.XHR<string>(sign)
      .then((resolve) => {
        let signInfoResponse: signInfoResponse = JSON.parse(resolve)
        if (signInfoResponse.code === 0) tools.Log(userData.nickname, '已签到')
      })
      .catch((reject) => { tools.Log(userData.nickname, reject) })
  }
  /**
   * 每日签到PC
   * 
   * @private
   * @param {string} uid
   * @memberOf Online
   */
  private _DoSignPC(uid: string) {
    let userData = options.usersData[uid],
      sign: request.Options = {
        uri: `${rootOrigin}/sign/GetSignInfo`,
        jar: cookieJar[uid]
      }
    tools.XHR<string>(sign)
      .then((resolve) => {
        let signInfoResponse: signInfoResponse = JSON.parse(resolve)
        if (signInfoResponse.data.status === 0) {
          let doSign: request.Options = {
            uri: `${rootOrigin}/sign/doSign`,
            jar: cookieJar[uid]
          }
          tools.XHR(doSign).catch((reject) => { tools.Log(userData.nickname, reject) })
        }
      })
      .catch((reject) => { tools.Log(userData.nickname, reject) })
  }
  /**
   * 每日宝箱
   * 
   * @private
   * @param {string} uid
   * @memberOf Online
   */
  private _TreasureBox(uid: string) {
    let userData = options.usersData[uid],
      // 获取宝箱状态,换房间会重新冷却
      currentTaskResponse: currentTaskResponse,
      currentTaskUrl = `${rootOrigin}/mobile/freeSilverCurrentTask`,
      currentTaskQuery = `access_key=${userData.accessToken}&${AppClient.baseQuery}`,
      currentTask: request.Options = { uri: `${currentTaskUrl}?${AppClient.ParamsSign(currentTaskQuery)}` }
    tools.XHR<string>(currentTask)
      .then((resolve) => {
        currentTaskResponse = JSON.parse(resolve)
        if (currentTaskResponse.code === 0) return tools.Sleep(currentTaskResponse.data.minute * 6e4)
        else if (currentTaskResponse.code === -10017) return Promise.reject('已领取所有宝箱')
        else return Promise.reject('获取宝箱状态出错')
      })
      .then<string>((resolve) => {
        let awardUrl = `${rootOrigin}/mobile/freeSilverAward`,
          awardQuery = `access_key=${userData.accessToken}&${AppClient.baseQuery}`,
          award: request.Options = { uri: `${awardUrl}?${AppClient.ParamsSign(awardQuery)}` }
        return tools.XHR<string>(award)
      })
      .then<never | undefined>((resolve) => {
        let awardResponse: awardResponse = JSON.parse(resolve)
        if (awardResponse.code === 0) this._TreasureBox(uid)
        else return Promise.reject('error')
      })
      .catch((reject) => {
        if (reject === 'error') this._TreasureBox(uid)
        else tools.Log(userData.nickname, reject)
      })
  }
  /**
   * 每日宝箱PC
   * 
   * @private
   * @param {string} uid
   * @memberOf Online
   */
  private _TreasureBoxPC(uid: string) {
    let userData = options.usersData[uid],
      // 获取宝箱状态,换房间会重新冷却
      currentTaskResponse: currentTaskResponse,
      getCurrentTask: request.Options = {
        uri: `${rootOrigin}/FreeSilver/getCurrentTask?_=${Date.now()}`,
        jar: cookieJar[uid]
      }
    tools.XHR<string>(getCurrentTask)
      .then((resolve) => {
        currentTaskResponse = JSON.parse(resolve)
        if (currentTaskResponse.code === 0) return tools.Sleep(currentTaskResponse.data.minute * 6e4)
        else if (currentTaskResponse.code === -10017) return Promise.reject('已领取所有宝箱')
        else return Promise.reject('获取宝箱状态出错')
      })
      .then((resolve) => {
        let getCaptcha: request.Options = {
          uri: `${rootOrigin}/freeSilver/getCaptcha?ts=${Date.now()}`,
          encoding: null,
          jar: cookieJar[uid]
        }
        return tools.XHR<Buffer>(getCaptcha)
      })
      .then<string>((resolve) => {
        let captcha = DeCaptcha(resolve)
        if (captcha > -1) {
          let getAward: request.Options = {
            uri: `${rootOrigin}/FreeSilver/getAward?time_start=${currentTaskResponse.data.time_start}&time_end=${currentTaskResponse.data.time_end}&captcha=${captcha}&_=${Date.now()}`,
            jar: cookieJar[uid]
          }
          return tools.XHR<string>(getAward)
        }
        else return Promise.reject('error')
      })
      .then((resolve) => {
        let awardResponse: awardResponse = JSON.parse(resolve)
        if (awardResponse.code === 0) {
          this._TreasureBoxPC(uid)
          return Promise.resolve('ok')
        }
        else return Promise.reject('error')
      })
      .catch((reject) => {
        if (reject === 'error') this._TreasureBoxPC(uid)
        else tools.Log(userData.nickname, reject)
      })
  }
  /**
   * 日常活动
   * 
   * @private
   * @param {string} uid
   * @param {number[]} roomIDs
   * @memberOf Online
   */
  private _EventRoom(uid: string, roomIDs: number[]) {
    let userData = options.usersData[uid]
    roomIDs.forEach((roomID) => {
      let getInfo: request.Options = { uri: `${rootOrigin}/live/getInfo?roomid=${roomID}` }
      tools.XHR<string>(getInfo)
        .then((resolve) => {
          let roomInfoResponse: roomInfoResponse = JSON.parse(resolve),
            index: request.Options = {
              uri: `${rootOrigin}/eventRoom/index?ruid=${roomInfoResponse.data.MASTERID}`,
              jar: cookieJar[uid]
            }
          return tools.XHR<string>(index)
        })
        .then((resolve) => {
          let eventRoomResponse: eventRoomResponse = JSON.parse(resolve)
          if (eventRoomResponse.code === 0 && eventRoomResponse.data.heart) {
            let heartTime = eventRoomResponse.data.heartTime * 1000
            setTimeout(() => {
              this._EventRoomHeart(uid, heartTime, roomID)
            }, heartTime)
          }
        })
        .catch((reject) => { tools.Log(userData.nickname, reject) })
    })
  }
  /**
   * 发送活动心跳包
   * 
   * @private
   * @param {string} uid
   * @param {number} heartTime
   * @param {number} roomID
   * @memberOf Online
   */
  private _EventRoomHeart(uid: string, heartTime: number, roomID: number) {
    let userData = options.usersData[uid],
      heart: request.Options = {
        method: 'POST',
        uri: `${rootOrigin}/eventRoom/heart?roomid=${roomID}`,
        jar: cookieJar[uid]
      }
    tools.XHR<string>(heart)
      .then((resolve) => {
        let eventRoomHeartResponse: eventRoomHeartResponse = JSON.parse(resolve)
        if (eventRoomHeartResponse.data.heart) {
          setTimeout(() => {
            this._EventRoomHeart(uid, heartTime, roomID)
          }, heartTime)
        }
      })
      .catch((reject) => { tools.Log(userData.nickname, reject) })
  }
}
/**
 * 签到信息
 * 
 * @export
 * @interface signInfoResponse
 */
interface signInfoResponse {
  code: number
  msg: string
  data: signInfoResponseData
}
interface signInfoResponseData {
  text: string
  status: number
  allDays: string
  curMonth: string
  newTask: number
  hadSignDays: number
  remindDays: number
}
/**
 * 在线心跳返回
 * 
 * @interface userOnlineHeartResponse
 */
interface userOnlineHeartResponse {
  code: number
  msg: string
}
/**
 * 在线领瓜子宝箱
 * 
 * @interface currentTaskResponse
 */
interface currentTaskResponse {
  code: number
  msg: string
  data: currentTaskResponseData
}
interface currentTaskResponseData {
  minute: number
  silver: number
  time_start: number
  time_end: number
}
/**
 * 领瓜子答案提交返回
 * 
 * @interface awardResponse
 */
interface awardResponse {
  code: number
  msg: string
  data: awardResponseData
}
interface awardResponseData {
  silver: number
  awardSilver: number
  isEnd: number
}
/**
 * 活动信息
 * 
 * @interface eventRoomResponse
 */
interface eventRoomResponse {
  code: number
  msg: string
  data: eventRoomResponseData
}
interface eventRoomResponseData {
  eventList: eventRoomResponseDataEventList[]
  heart: boolean
  heartTime: number
}
interface eventRoomResponseDataEventList {
  status: boolean
  score: number
  giftId: number
  type: string
  masterTitle: string
  keyword: string
  bagId: number
  num: number
  kingMoney: number
  isGoldBinBin: number
  goldBinBinInRoom: number
  team_id: number
  goldBinBinHeart: number
  is2233: number
}
/**
 * 活动心跳返回
 * 
 * @interface eventRoomHeartResponse
 */
interface eventRoomHeartResponse {
  code: number
  msg: string
  data: eventRoomHeartResponseData
}
interface eventRoomHeartResponseData {
  uid: number
  gift: eventRoomHeartResponseDataGift
  heart: boolean
}
interface eventRoomHeartResponseDataGift {
  '43': eventRoomHeartResponseDataGiftOrange; // 命格转盘
}
interface eventRoomHeartResponseDataGiftOrange {
  num: number
  bagId: number
  dayNum: number
}
/**
 * 房间信息
 * 
 * @interface roomInfoResponse
 */
interface roomInfoResponse {
  code: number
  msg: string
  data: roomInfoResponseData
}
interface roomInfoResponseData {
  UID: number
  IS_NEWBIE: number
  ISATTENTION: number
  ISADMIN: number
  ISANCHOR: number
  SVIP: number
  VIP: number
  SILVER: number
  GOLD: number
  BLOCK_TYPE: number
  BLOCK_TIME: number
  UNAME: number
  MASTERID: number
  ANCHOR_NICK_NAME: string
  ROOMID: number
  _status: string
  LIVE_STATUS: string
  ROUND_STATUS: number
  AREAID: number
  BACKGROUND_ID: number
  ROOMtITLE: string
  COVER: string
  LIVE_TIMELINE: number
  FANS_COUNT: number
  GIFT_TOP: roomInfoResponseDataGiftTop[]
  RCOST: number
  MEDAL: any[]
  IS_STAR: boolean
  starRank: number
  TITLE: roomInfoResponseDataTitle
  USER_LEVEL: roomInfoResponseDataUserLevel[]
  IS_RED_BAG: boolean
  IS_HAVE_VT: boolean
  ACTIVITY_ID: number
  ACTIVITY_PIC: number
  MI_ACTIVITY: number
  PENDANT: string
}
interface roomInfoResponseDataGiftTop {
  uid: number
  uname: string
  coin: number
  isSelf: number
}
interface roomInfoResponseDataTitle {
  title: string
}
interface roomInfoResponseDataUserLevel {
  level: number
  rank: number
}
// gm mogrify -crop 80x31+20+6 -quality 100 getCaptcha.jpg
// gm mogrify -format pbm -quality 0 getCaptcha.jpg