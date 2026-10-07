# 颗秒日事

日历、待办、倒数日和便签一体的本地优先网页应用。属于「歪歪滴艾斯 / 颗秒」软件产品线，目标入口：

[https://www.yydsxwh.com/products](https://www.yydsxwh.com/products) → `/products/days`

## 产品做什么

参考滴答清单的待办排期、Days Matter 的大数字倒数、便利贴式便签，以及优效日历把事情画在月历上的做法，做成一个页面就能用的网页版。

- **今日**：问候、今天的课、考试时间表、待办、倒数日、钉住便签
- **日历**：月视图圆点（待办 / 倒数日 / 便签 / 考试）
- **待办**：到期日、高中低优先级、筛选
- **超级课程表**：周视图；导入 xls/xlsx/csv/ods，或把课表照片 / PDF / Word 交给站内 AI（与 MathCode 同一套视觉接口）识别课程、地点、时间、老师和时长；上课提醒
- **考试时间表**：期中 / 期末 / 补考，按日期时间提醒，减少记错错过
- **倒数日**：大数字卡片、颜色、表情、每年重复
- **便签**：彩色便利贴，可钉住、可搜索

数据存在浏览器 `localStorage`，无需登录也能用。登录账号中心后，网页和 Android 按同一个 OIDC `sub` 同步。

Android 客户端用 Capacitor 包同一套网页：`com.yydsxwh.kemiao.days`，青春校园粉蓝火焰主题，上课/考试走系统本地通知。

```bash
npm run build:android
npm run android:apk
```

生成 `android/app/build/outputs/apk/debug/app-debug.apk`。本机也可在 Android Studio 打开 `android/`。网页版仍走 `/products/days`。

## 本地开发

```bash
npm install
npm run dev:bff   # 127.0.0.1:3120，登录 / 同步 / OCR
npm run dev
```

打开 http://localhost:5173。未配置账号中心密钥时，离线功能仍可用。

```bash
npm run lint
npm run build
npx --yes tsx src/lib/timetable-import.selftest.ts
```

## 和主站的关系

日事的页面和 API 不跑在主站 Node 进程里。页面是 Nginx 上的静态文件（`/products/days/`），接口是本机 `kemiao-days-sync`（`127.0.0.1:3120`）。主站进程停了，已经打开的日事、本地数据和已登录后的云同步仍然可用。

还依赖主站的只有可选能力：旧账号的一次性数据迁移、课表识别在 Platform 未配置时的回退、便签导出到网页文档。这些失败时日历、待办、课表和提醒不受影响。新登录走账号中心，不走主站。

线上入口：

- 产品栏：https://www.yydsxwh.com/products
- 应用：https://www.yydsxwh.com/products/days/

发布静态包（本机需有 `~/.ssh/yyds_aliyun`，不要把私钥提交进仓库）：

```bash
./scripts/deploy-days.sh
```

主站产品卡片在服务器上的 Andyyyds 源码里（`packages/shared/src/software-products.ts`），改完后需要在 `/var/www/yyds-course-platform` 执行 `npm run build` 并 `pm2 restart yyds-course`。

## 好友叫醒

被叫醒的人自己授权之后，好友才能给那部 Android 手机设闹钟。kkchat 好友、同群或同一个待办都不会自动得到权限。授权可以是一段时间、永久（仍可随时撤销）或跟随某个待办 / 日程 / 考试。

手机必须用 `AlarmManager` 登记。服务端创建成功只表示「已发送，等待对方手机注册闹钟」。收到 `DEVICE_SCHEDULED` 回执之后，界面才显示对方手机已设置。没有精确闹钟权限时不会报这个成功。

没有使用 `USE_EXACT_ALARM`。日事用 `SCHEDULE_EXACT_ALARM`，由用户在系统「闹钟和提醒」里允许。全屏意图不可用时仍会响铃和振动，只是退成高优先级闹钟通知。

接口在日事 BFF 上，不进主站 Node 进程：

- `GET/POST /api/days/remote-alarm/grants`
- `GET/POST /api/days/remote-alarm/alarms`
- `POST /api/days/devices`

Android 的接口地址来自构建环境 `RISHI_API_BASE_URL`，登录地址可用 `RISHI_LOGIN_URL` 单独覆盖。本次临时应急默认是 `https://xiaowenhua.net/kemiao-days-api`。这是香港服务器上的隔离路径，不是长期下载中心。恢复吉隆坡后改这两个变量并重新发包，业务代码不用跟着改。长期发布仍走 Platform Releases。

推送是可选的。配置了下面三个环境变量才会发 FCM data message，消息里只有「去同步」，闹钟内容仍要登录后拉取：

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`（PEM，换行写成 `\n`）

不要把 service account JSON、keystore 或私钥提交进仓库。没有这三项时，手机在打开应用、回到前台，以及大约每 15 分钟的后台同步里登记闹钟。

账号目录可选：

- `ACCOUNT_DIRECTORY_URL`
- `ACCOUNT_INTERNAL_TOKEN`

没有目录时，授权人填写对方的 `usr_` 账号 ID。这不会建立另一套好友库。

正式包版本写在 `android-native/app/build.gradle.kts`。签名只用已有的 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`，构建结束删除临时 keystore。应急下载地址是 `https://xiaowenhua.net/downloads/rishi/kemiao-days.apk`，版本归档是同目录的 `kemiao-days-v<version>.apk`。上传先写临时文件，校验 SHA-256 后再改名。

`www.yydsxwh.com` 的 DNS 已经指向吉隆坡。这次没有吉隆坡登录密钥，所以没有改吉隆坡。香港 BFF 的登录回调改成了 `https://xiaowenhua.net/kemiao-days-api/api/days/auth/callback`，这样状态 cookie 和回调在同一个域名。账号中心目前还没有登记这个地址。站长需要在账号中心「软件产品」里给 client `rishi` 增加这一条回调，登录才会通过。登记之前，新 APK 的登录会被账号中心拒绝，提示「回调地址未登记」。

恢复吉隆坡之后，把 `ACCOUNT_REDIRECT_URI` 和日事后台里保存的 Account 回调改回 `https://www.yydsxwh.com/api/days/auth/callback`，再把 `RISHI_API_BASE_URL` 指回正式入口并重新发包。香港上的 `integrations.enc.bak-remote-alarm` 是改回调前的备份。
