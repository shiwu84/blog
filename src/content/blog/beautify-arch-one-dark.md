---
title: 把 Arch 画成 One Dark Pro，然后在登录界面翻了车
description: 从一句「输入法主题太丑了」开始，三天里换了状态栏、换了通知守护进程、换了终端，还为一个登录界面手动编译了 ly。最后发现两套调色板叠在同一个配置文件里。
pubDate: 2026-11-22
collection: 折腾日志
collectionDescription: 服务器、部署与各种工具折腾记录
tags:
  - Arch Linux
  - niri
  - One Dark Pro
  - Wayland
  - 美化
  - pi
---

11 月 20 号上午，我在修 Godot 打不开的问题。修完之后顺口说了句：

> 现在可以了，帮我配置输入法主题，现在的太丑了，另外我希望系统一直是暗色模式。

三天后，我的登录界面用的是 Catppuccin，桌面用的是 One Dark Pro。两个都由我点头确认过，只是它们不该同时出现在一台机器上。

## 从输入法皮肤开始

fcitx5 默认那套皮肤是浅蓝渐变，在深色终端里一弹出来，像有人开了手电筒。Pi 给我写了个新主题，放在 `~/.local/share/fcitx5/themes/mocha-dark/`。`theme.conf` 里定颜色，箭头、翻页这些图从 `default-dark` 拷过来改。配色是 One Dark Pro 的那六个值，`HighlightBackgroundColor=#61afef`。

暗色模式那件事，我一开始以为只是设个开关。实际上 Wayland 下要同时管四条线：

```bash
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
~/.config/gtk-3.0/settings.ini
~/.config/gtk-4.0/settings.ini
~/.config/environment.d/90-dark-mode.conf   # Qt 应用跟随
```

少任何一条，都会有几个程序在深色桌面上保持浅色。`environment.d` 那份是常驻的，不依赖桌面环境启动脚本——Pi 说这是「一劳永逸的位置」，我同意。

## 状态栏第一版：被我自己否了

niri 没有 Waybar 的原生支持，Pi 列了三个替代：Wayle（仅 AUR）、Quickshell（DIY）、ironbar（官方仓库，GTK4 + TOML，原生 niri 模块）。选了 ironbar。

第一版装好，我回了一句英文：

> it's ugly

Pi 改了一版。第二版我发了张截图过去：

> 太丑了，你知道吗，我喜欢 One Dark Pro的主题配色，另外，关于 ironbar 的配置，你可以多看看 GitHub 中其他人是怎么设计的。

这句把要求、偏好、方向一次说清了：颜色、参考来源都给了。

那之后 ironbar 改了三轮：

| 轮次 | 问题 | 改法 |
|---|---|---|
| 2 | 颜色不对 | One Dark Pro 六色（背景 `#21252b`、强调 `#61afef`） |
| 3 | 图标大小不一 | tray / focused / network / battery 四处统一 16px |
| 4 | 全屏时还挡着 | `layer = "overlay"` 改 `top`；这其实是 niri 对 top 层的正常行为，不是 bug |

第三轮里还加了一条 `network_manager.interface_whitelist = ["wlan0"]`。不加的话，`lo` 和 `dae0` 会各占一个图标——我机器上有 docker，如果不筛，状态栏右边能排出四个网卡。

## niri：把单文件拆成九块

原来的 `config.kdl` 一个文件 654 行（留着的备份 `config.kdl.bak-0818` 可以数）。Pi 拆成了 `parts/` 下九个文件，合计 514 行：

```bash
ls ~/.config/niri/parts/
animations.kdl binds.kdl environment.kdl input.kdl layout.kdl
misc.kdl output.kdl startup.kdl window-rules.kdl
```

拆分之后改配色不用在 600 行里翻。One Dark Pro 的具体值：`gaps 14`、`focus-ring width 3`、阴影 `softness 20`、全局圆角 `10`、`prefer-no-csd`、光标 3 秒不动自动隐藏。

**焦点环的颜色调了三版。** 原版是 `#61afef → #c678dd` 满饱和渐变，我嫌太抢眼。Pi 截了三张图给我选：

| 方案 | 做法 | 我的判断 |
|---|---|---|
| A | 原色 + 55% 透明 | 还是艳，而且半透明在亮壁纸上发灰 |
| B | 同色 + 40% 透明 | 同上 |
| C | 去饱和不透明（`#4f7396 → #7a6396`） | 边缘还在，不抢眼了 |

选了 C。这个细节我记下来是因为：**透明度和饱和度是两件事**，我之前一直以为「降低存在感」就是加透明。

## 通知：为了一条 bar 上的计数，换掉守护进程

ironbar 的 `notifications` 模块只支持 SwayNC。schema 里写死 "SwayNC state icons"，官方 README 说检测不到就自动隐藏。我装的是 mako，所以 bar 上那个通知计数永远是空的。

换 swaync。名字带 sway，但它不依赖 sway/wlroots。只要合成器支持 `wlr-layer-shell` 就能跑。它实现的是标准 `org.freedesktop.Notifications` D-Bus 接口。

`pacman -Rns mako` 之后，swaync 起不来：

```text
Job for swaync.service failed because start of the service was attempted too often
```

原因是 mako 的**进程**还活着，占着 `org.freedesktop.Notifications` 这个名字。删包不等于杀进程。手动 kill 掉，再 `systemctl --user enable --now swaync`，好了。

swaync 的 `style.css` 是自己写的，16.7 KB，One Dark 全套变量：

```css
:root {
  --cc-bg: rgba(33, 37, 43, 0.94);
  --noti-border-color: rgba(97, 175, 239, 0.16);
}
```

## 锁屏：参考了一个我没装的发行版

> 我想要配置锁屏和熄屏动画，你知道 Omarchy 吗？这个发行版是怎么实现的？

Omarchy 是 DHH 那套 Arch + Hyprland 配置。Pi 去读它的实现，回来给的是 `swayidle` + `swaylock-effects`，没有用 Omarchy 自己那些脚本。最后落地是：

- 5 分钟锁屏
- 10 分钟渐暗 + DPMS 关屏
- 合盖前先锁

渐暗那步我一开始以为是调背光，其实 Pi 写了个 14 步的 `screen-fade`，每次减一点，最后交给 DPMS：

> 绝不写 0，防止变砖。

背光写 0 之后，屏幕在全黑状态下你还得靠键盘摸回来。这个提醒比我预想的实在。

## 终端：为了在 yazi 里看图片，换了两次

> alacritty 不能使用 yazi 的图片预览？

不能，而且不是配置问题。yazi 支持 Kitty 图形协议、Sixel、iTerm2 内联图片，alacritty 一个都没有。`strings alacritty | grep -i sixel` 是空的，官方支持的终端列表里也没有它。

alacritty 的 FAQ 里有一句：

> **_Why isn't feature X implemented?_** Alacritty has many great features, but not every feature from every other terminal...

我追问「为啥不支持」。Pi 翻到那个 PR：265 条评论、311 个赞，2021 年开的，至今 open。结论是维护者认为终端不该做图片。

于是下一步：换终端吗？

Pi 没直接推荐，先解包 foot 到 `/tmp` 实测了一把 Sixel——在我的 1.25 分数缩放下，yazi 右边是真图，不是方块字符。然后列了三个候选的取舍，最后我选了 Ghostty：

> 我选择 Ghostty

Ghostty 用 Kitty 图形协议，字清晰，fcitx5 的中文候选框也正常。alacritty 卸载之前，Pi 把 niri 里两处引用都清了（`Mod+Shift+T` 的绑定、`app-id=^Alacritty$` 的毛玻璃规则）。

这件事的教训不在终端选型：**我原来以为图片预览是个配置项，实际上它是终端能力的天花板。** 换配置解决不了。

## 全链路一套配色

到这步才开始「刷漆」，前面都是换零件。

| 对象 | 做法 |
|---|---|
| 字体 | `Maple Mono NF CN` 12pt；fontconfig 把中文落到 `Noto Sans CJK SC` |
| ghostty | One Dark Pro 16 色 + `background-opacity = 0.88` 毛玻璃 |
| yazi | 从默认 261 行 theme.toml 里挑字段，写自己的 `theme.toml` |
| Firefox | `userChrome.css` + `userContent.css` + `user.js` |
| helix | gutters 用线条不用方块、undercurl、statusline 字段 |
| jj | 提交颜色对齐 One Dark，`user.name=shiwu` |
| man / less | `environment.d` 里设 pager 和颜色 |

tealdeer 那段比较难受。配置连报三次 schema 错，`quiet`、`indent`、`descriptions` 它都不认识。最后是照着 `--help` 里的 `Config` 小节一项项对着写的。**Rust 程序的 TOML 配置报错只说「unknown field」，不告诉你有哪些可选字段**，这点不如 JSON Schema。

## 登录界面：字号、版本、和两套调色板

前面全在 Wayland 会话里，屏幕一黑，那些配置一个都不生效。剩下的是 tty1。

### 字号为什么看起来不对

> 关于 kmscon 的字体大小需要调整。现在太小了。

`kmscon.conf` 里写着 `font-size=20`，但 GUI 里 20 已经很大了。Pi 的解释我记到现在：

> GUI 里的字被放大了 1.25 倍，kmscon 没有缩放。ghostty 写 12，实际画到屏幕上是 15；kmscon 填 20 就是 20 像素。

还有一条：`setfont ter-132b` 对 kmscon 无效。kmscon 自己抢 DRM master，用 gltex 画字形，根本不经过内核字体。而且 `ter-132b` 是点阵字体，只有两种尺寸，没有中文。

现在的实际值是 **22**，写在 systemd drop-in 的命令行里：

```ini
# /etc/systemd/system/ly-kmsconvt@.service.d/10-theme.conf
ExecStart=/usr/bin/kmscon --font-engine freetype --font-name "Maple Mono NF CN" --font-size 22 ...
```

`kmscon.conf` 里那行 `font-size=0` 不是没设，是「按屏幕分辨率自动检测」。真正定下 22 的是另一个地方——Pi 在美化 ly 的脚本里写了个 drop-in：

```ini
# /etc/systemd/system/ly-kmsconvt@.service.d/10-theme.conf
[Service]
ExecStart=
ExecStart=/usr/bin/kmscon --font-engine freetype --font-name "Maple Mono NF CN" --font-size 22 ...
```

`ExecStart=` 先清空原值再重写，这是 systemd 覆盖 unit 的标准写法。至于生效顺序，`man kmscon` 一句话就定了：

> Command-line options override configuration file options.

所以 0 的「自动」被 22 顶掉了。**两个文件都在管同一件事，只看一个就会得出错误结论**，这点我一开始就搞错了。

### ly 的版本困局

我原来用的 ly 是官方仓库的，登录界面朴素到只有黑底白字。想换动画，发现 Arch `extra` 里是 1.4.1（2026-05 打包），上游 Codeberg 已经是 1.5.0，master 是 1.6.0 开发版。AUR 的 `ly-git` 反而更旧（1.4.0.r6）。

所以只能自己编译。ly 1.5.0 用 zig 写，需要 zig 0.17.1，编译参数 `ReleaseSafe`、关掉 X11。编译产物 12 MB，装的时候是**直接覆盖 `/usr/bin/ly-dm`**，原件备份成 `ly-dm-1.4.1.bak`。

装完之后，`pacman` 依旧认为 ly 是 1.4.1：

```bash
$ pacman -Q ly
ly 1.4.1-1
$ /usr/bin/ly-dm --version
info: ly version 1.5.0
$ pacman -Qkk ly
警告：ly：/usr/bin/ly-dm（SHA256校验和不一致）
```

**这是绕过包管理改文件。** 下次 `pacman -Syu` 遇到 ly 更新，会把 1.5.0 覆盖回新版 1.4.x，不报错、不提示。表现是登录界面突然变回旧样式，`corner_*` 这些新配置项失效。

### 那一轮的摩擦

ly 美化是我这三天里话说得最重的一段，前后问了四次「你在做什么」：

> 你在做什么？？？
>
> 你在做什么？
>
> ly 美化这么复杂吗？你在搞什么？
>
> 干啥呢？

中间我说过一次：

> 这样吧，我来装 zig，你来告诉我编译步骤。

最后收尾：

> 换回原来的黑客帝国吧

现在 `animation = matrix`，绿色代码雨，`bg = 0x0011111B`。我写了个 `aurora.lua` 极光动画，蓝紫粉流动加星点，留在 `beautify/` 目录里没删，改一行配置就能换回去。

## 翻车的地方

写这篇文章之前我让 Pi 把所有美化项重新核了一遍，核出两个我自己不知道的事。

**第一，`/etc/kmscon/kmscon.conf` 里叠了两套调色板。**

```text
156  # ---- One Dark Pro（root-setup.sh 追加）----
157  palette=custom
176  # >>> catppuccin-mocha >>>
177  palette=custom
196  # <<< catppuccin-mocha <<<
```

两个脚本各追加了一次，同名键后者覆盖前者。所以现在的登录界面是 **Catppuccin Mocha**，不是我以为的 One Dark Pro。桌面是 One Dark，登录层是 Catppuccin，中间断了一刀。

**第二，`beautify/` 目录已经长到 17 个文件。** 里面有一次性的安装脚本、一个 12 MB 的编译产物、动画预览器、`dur/` 里的动画文件、几十张预览截图。这些东西散在 `~/beautify` 和 `scripts/system/beautify/` 两处，靠文件名认。

## 现在的状态

| 层 | 配色 | 备注 |
|---|---|---|
| niri / ironbar / swaync / walker | One Dark Pro | 手配 |
| ghostty / btop / yazi / bat / eza / starship | One Dark Pro | 手配 |
| fcitx5 | mocha-dark | 自写 |
| kmscon（登录界面） | **Catppuccin Mocha** | 两套叠着，后者生效 |
| ly | Catppuccin 绿 + matrix 动画 | 手动编译 1.5.0 |
| plymouth | bgrt | 开机动画 |

下一步是清理 kmscon 那两套调色板，注释掉 Catppuccin，让 One Dark 重新生效。脚本已经写好，改前备份，可重复运行。

## 三天里最有用的一句话

不是任何一条配置。是 Pi 在我催它的时候说的：

> 抱歉，我没有先说明就在连续操作。

那之后它才开始先讲计划再动手，我也才知道它在干什么。美化本身没什么难的，难的是我不知道它为什么要改一个我已经调好的值。那四次「你在做什么」，一半怪它不说，一半怪我没要求它先说。
