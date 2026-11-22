---
title: 六天，把 Arch 配成现在这样
description: 11 月 16 号装完系统，黑底白字只有一个 tty。六天后有滚动平铺的桌面、自编译的登录管理器、120 个显式安装的包。中间遇上一次 Godot 打不开，提的 issue 在 15 小时内被上游修掉。
pubDate: 2026-11-22
collection: 折腾日志
collectionDescription: 服务器、部署与各种工具折腾记录
tags:
  - Arch Linux
  - niri
  - Wayland
  - One Dark Pro
  - Godot
  - 配置
---

11 月 16 号晚上八点半，Arch 装完了。开机是一个黑底白字的 tty，字体是内核默认的点阵，我连 WiFi 都得先敲 `iwctl`。

六天后，同样这台机器：滚动平铺的窗口管理器、自编译的登录管理器、120 个显式安装的包、一套统一的配色。中间还夹着一次 Godot 打不开的事故。

这篇按「一层一层搭上去」的顺序写，不是逐日流水账。

## 底座：btrfs、快照、没有 swap

分区在装系统时就定下了：ESP 1G 挂 `/boot`，剩下全给 btrfs 一个分区，子卷切开：

```text
@       → /
@home   → /home
@pkg    → /var/cache/pacman/pkg
@log    → /var/log
```

分开的理由不一样：`/home` 要单独快照和恢复，`@pkg` 是包缓存（清了不心疼，但恢复系统时能离线装包），`@log` 怕日志把根分区写满。

**没有磁盘 swap，只有 4G zram。** 16G 内存的轻薄本，日常负载用不着 swap；真需要的时候 zram 压缩比也比磁盘快。少一个 swap 分区，后面装 Windows 时也少一个要处理的交互点。

`snapper` 管每小时快照，`btrfs-progs` 是底层工具。这套在缩分区给 Windows 那一步救了命——虽然最后没用上，但确认过能回滚。

引导用 systemd-boot + UKI（统一内核镜像），内核参数直接烧进 `.efi` 里：

```text
root=PARTUUID=262f86ad-74d9-418c-9b54-879492448bcd rootflags=subvol=@ rootfstype=btrfs
```

**这个 PARTUUID 后来成了硬约束**：装双系统缩分区时，`p2` 的 UUID 一个字符都不能变，否则 UKI 里的 root 参数指向不存在的设备，直接起不来。

## 桌面：niri、ironbar、walker

`niri` 是滚动平铺的 Wayland 合成器，窗口从左往右排成一条无限长的带子，不重叠。选中它的原因很实际：不需要手动分屏，滚一下就换焦点，写代码开三个终端特别顺。

状态栏本来可以用 Waybar——niri 支持 layer-shell，Waybar 跑得起来。是我不喜欢它的样子和配置方式，所以看别的。三个候选：Wayle（仅 AUR）、Quickshell（要自己写 QML）、`ironbar`（官方仓库，GTK4 + TOML，原生 niri 模块）。选了 ironbar。

第一版装上，我发了句 `it's ugly`。第二版发了张截图：

> 太丑了，你知道吗，我喜欢 One Dark Pro的主题配色，另外，关于 ironbar 的配置，你可以多看看 GitHub 中其他人是怎么设计的。

这句话把要求、偏好、方向一次说清了。改了三轮：

| 轮次 | 问题 | 改法 |
|---|---|---|
| 2 | 配色不对 | One Dark Pro 六色，背景 `#21252b` |
| 3 | 图标大小不一 | tray / focused / network / battery 统一 16px |
| 4 | 全屏时还挡着 | `layer = "overlay"` 改 `top` |

第四轮那个不是 bug：niri 对 top 层的窗口在全屏时会隐藏，overlay 层不会。我要的是「全屏看电影时状态栏消失」。

启动器是 `walker`，源码构建的（不在 pacman 列表里），配 15 个 `elephant-*` 数据源：应用、剪贴板、计算器、文件、窗口切换、网页搜索、Todo……

**walker 上踩了个坑**：`Mod+D` 打开后搜不到东西。查了半天不是配置问题。niri 下 `on-demand` 的键盘焦点不会自动给，得在 `config.toml` 里写 `force_keyboard_focus = true`。验证方式是截图逐像素对比，看搜索框里有没有光标闪烁。

通知从 mako 换成了 `swaync`。原因很具体：ironbar 的 `notifications` 模块只支持 SwayNC，schema 里写死 "SwayNC state icons"，装 mako 时那个通知计数永远是空的。

`pacman -Rns mako` 之后 swaync 起不来：

```text
Job for swaync.service failed because start of the service was attempted too often
```

**删包不等于杀进程。** mako 还活着，占着 `org.freedesktop.Notifications` 这个 D-Bus 名字。手动 kill 掉才起来。

锁屏参考了 Omarchy（DHH 那套 Arch + Hyprland 配置）的思路：`swayidle` + `swaylock-effects`，5 分钟锁屏、10 分钟渐暗。渐暗脚本 14 步减到 1%，再交给 DPMS 关屏——**绝不写 0**，背光归零之后屏幕全黑，你都不知道键盘还在不在响应。

## 终端：从 alacritty 换到 ghostty

zsh 换掉了 bash，root 也换了。`starship` 提示符，`eza` 替 `ls`，`bat` 替 `cat`，`fzf`、`zoxide`、`btop`、`fastfetch`、`tealdeer`。

终端本来用 alacritty。直到我想在 `yazi` 里看图片预览：

> alacritty 不能使用 yazi 的图片预览？

不能，而且不是配置问题。yazi 支持 Kitty 图形协议、Sixel、iTerm2 内联图片，alacritty 一个都没有。它的 FAQ 里有一句：

> **_Why isn't feature X implemented?_** Alacritty has many great features, but not every feature from every other terminal...

后来翻到那个 PR：265 条评论、311 个赞，2021 年开的，至今 open。维护者认为终端不该做图片。

**这是能力天花板，不是配置项。** 换配置解决不了。

试了 foot（Sixel），在 1.25 分数缩放下真图正常。最后选了 Ghostty（Kitty 协议），字体清晰，fcitx5 候选框也正常。卸载 alacritty 前把 niri 里两处引用都清了：`Mod+Shift+T` 的绑定、`app-id=^Alacritty$` 的毛玻璃规则。

## 输入法：fcitx5 + 雾凇

`fcitx5` + `fcitx5-rime` + `rime-ice-git`（雾凇拼音）。

四个模块缺一不可：`fcitx5-gtk`（GTK 程序）、`fcitx5-qt`（Qt 程序）、`environment.d/im.conf`（环境变量）、`fcitx5` 本体。少任何一个，对应框架的程序就调不出候选框。

默认皮肤是浅蓝渐变，在深色终端里弹出来像开了手电筒。自己写了个 `mocha-dark` 主题：

```ini
NormalColor=#abb2bf
HighlightCandidateColor=#21252b
HighlightBackgroundColor=#61afef
```

图从 `default-dark` 拷过来改色，省得重画箭头。

## 登录层：plymouth、kmscon、ly

前面全在 Wayland 会话里，屏幕一黑，那些配置一个都不生效。剩下的是 tty1。

### plymouth

开机动画。三处要改：

```bash
# /etc/mkinitcpio.conf
HOOKS=(base udev plymouth ...)
# /etc/kernel/cmdline
... quiet splash
```

然后 `mkinitcpio -P` 重建 UKI。注意不是只重建 initramfs，还要把 `quiet splash` 烧进内核参数。

这里踩了个 `pipefail` 的坑：脚本里判断主题时用了 `plymouth-set-default-theme -l | grep -qx "$theme"`，`grep` 提前退出触发 SIGPIPE，管道整体判失败，于是回退到了默认主题 `bgrt`。**`cmd | grep -q` 在 `set -o pipefail` 下是陷阱。**

### kmscon

tty1 上跑的不是裸 tty，是 `kmscon` 在跑 `ly-dm`。

字号调了很久。当时配置文件里写的是 `font-size=20`，可 GUI 里 20 已经很大，kmscon 却显得小。解释是这个：

> GUI 里的字被放大了 1.25 倍，kmscon 没有缩放。ghostty 写 12，实际画到屏幕上是 15；kmscon 填 20 就是 20 像素。

所以 GUI 的「20」和 tty 的「20」不是一回事。

`setfont ter-132b` 对 kmscon 无效——kmscon 自己抢 DRM master，用 gltex 画字形，根本不经过内核字体。而且 `ter-132b` 是点阵字体，没有中文。

**这里有个后来才搞清楚的点**：配置文件现在已经改成 `font-size=0`，那是「按屏幕分辨率自动检测」，不是没设。但 systemd drop-in 里有一行 `--font-size 22`，而 `man kmscon` 说：

> Command-line options override configuration file options.

所以 0 的「自动」被 22 顶掉了。两个文件都在管同一件事，只看一个就会得出错误结论。

### ly

TUI 登录管理器。官方仓库的是 1.4.1，上游已经 1.5.0，master 是 1.6.0。AUR 的 `ly-git` 反而更旧（1.4.0.r6）。

所以自己编译。ly 用 zig 写，要 zig 0.17.1，`ReleaseSafe`，关掉 X11。装的时候直接覆盖 `/usr/bin/ly-dm`，原件备份成 `ly-dm-1.4.1.bak`。

**这是绕过包管理改文件。** `pacman -Q ly` 还说 1.4.1，但二进制是 1.5.0。`pacman -Qkk` 会报出来：

```text
警告：ly：/usr/bin/ly-dm（SHA256校验和不一致）
```

下次 `pacman -Syu` 遇到 ly 更新，会把 1.5.0 覆盖回新版 1.4.x，不报错、不提示。表现是登录界面突然变回旧样式，`corner_*` 这些新配置项失效。

ly 的美化是这六天里话说得最重的一段，中间问了四次「你在做什么」。最后我说：

> 换回原来的黑客帝国吧

现在是 `animation = matrix`，绿色代码雨。我写过一个极光动画（蓝紫粉流动加星点），留在 `beautify/` 目录里没删，改一行配置能换回去。

## 配色：一套 One Dark Pro，和一次翻车

桌面这层：niri、ironbar、swaync、walker、ghostty、btop、yazi、bat、eza、starship、jj、Firefox 的 `userChrome.css`，全是 One Dark Pro。

字体统一成 `Maple Mono NF CN`，中文落到 `Noto Sans CJK SC`。

**焦点环调了三版。** 原版是 `#61afef → #c678dd` 满饱和渐变，我嫌抢眼。三个方案截图对比：

| 方案 | 做法 | 判断 |
|---|---|---|
| A | 原色 + 55% 透明 | 还是艳，亮壁纸上发灰 |
| B | 同色 + 40% 透明 | 同上 |
| C | 去饱和不透明（`#4f7396 → #7a6396`） | 边缘还在，不抢眼 |

选了 C。**透明度和饱和度是两件事**，我之前一直以为「降低存在感」就是加透明。

但登录层翻了车。`/etc/kmscon/kmscon.conf` 里叠了两套调色板：

```text
156  # ---- One Dark Pro（root-setup.sh 追加）----
157  palette=custom
176  # >>> catppuccin-mocha >>>
177  palette=custom
196  # <<< catppuccin-mocha <<<
```

两个脚本各追加一次，同名键后者覆盖前者。所以桌面是 One Dark，登录界面是 Catppuccin——中间断了一刀。写这篇的时候才发现。

## 我装了些什么

120 个显式包，加依赖一共 837 个，AUR 27 个。挑有理由的说：

**系统底座**：`linux-zen` + `linux`（两个内核都留，zen 日常用）、`intel-ucode`、`btrfs-progs`、`snapper`、`zram-generator`、`mkinitcpio`、`efibootmgr`、`sof-firmware`（音频固件，笔记本没它没声音）。

**桌面**：`niri`、`ironbar`、`swaync`、`walker` + 15 个 `elephant-*`、`swayidle`、`swaylock-effects`、`awww`、`libdecor`。

**登录层**：`ly`、`kmscon`、`plymouth`。

**终端**：`ghostty`、`zsh` + `zsh-autosuggestions` / `zsh-syntax-highlighting` / `zsh-completions`、`starship`、`eza`、`bat`、`fzf`、`zoxide`、`btop`、`fastfetch`、`tealdeer`、`less`、`man-db`、`nushell`、`yazi`。

**输入法**：`fcitx5`、`fcitx5-configtool`、`fcitx5-gtk`、`fcitx5-qt`、`fcitx5-rime`、`rime-ice-git`。

**开发**：`godot`、`helix`、`jujutsu`、`clang` + `cmake` + `lldb`、`zig`（为了编译 ly）、`shellcheck`、`uv`、`python-gdtoolkit`、`jq`、`fd`、`ripgrep`、`7zip`、`unzip`。

**网络与硬件**：`networkmanager` + `iwd`、`bluez` + `bluez-utils`、`dae`、`localsend`、`ufw`、`power-profiles-daemon`、`brightnessctl`、`nvme-cli`、`playerctl`、`pipewire` 全家（`-alsa` / `-pulse` / `-jack` / `pulse`、`wireplumber`、`gst-plugin-pipewire`）。

**字体与主题**：`maple-mono-nf-cn-unhinted`、`noto-fonts` / `noto-fonts-cjk` / `noto-fonts-emoji`、`terminus-font`、`papirus-icon-theme`、`bibata-cursor-theme`。

**双系统**：`ntfs-3g`、`ntfsprogs`、`xorg-xwayland`、`xwayland-satellite`。

有几个我现在想不起来为什么装：`nushell`、`localsend`、`terminus-font`。先留着。

## 配到一半，Godot 打不开了

11 月 20 号早上七点零九，跑了次系统更新。九分钟后 Godot 起不来：

```text
ERROR: Condition "config_count == 0" is true. Returning: ERR_UNCONFIGURED
   at: _gldisplay_create_context (drivers/egl/egl_manager.cpp:224)
ERROR: Could not initialize OpenGL ES.
ERROR: Unable to create DisplayServer, all display drivers failed.
```

前一天刚全量升级过一轮，装了那么多东西，谁也说不好是哪个包。

先排除最容易被冤枉的：`vulkaninfo` 正常，`godot --rendering-driver vulkan` 能开。所以不是驱动坏了，是 OpenGL 这一条路断了。

`pacman -Q mesa` 是 `1:26.3.1-2`，翻日志：

```text
[2026-11-20T07:09:09+0800] upgraded mesa (1:26.2.7-1 -> 1:26.3.1-1)
```

时间对上了。

### 根因在一行没写的代码里

Godot 的 `_gldisplay_create_context()` 调 `eglChooseConfig()` 时，两个属性数组里都没写 `EGL_RENDERABLE_TYPE`。按 EGL 1.5 规范，这个属性默认是 `EGL_OPENGL_ES_BIT`，也就是 OpenGL ES **1.x**。

而 Mesa 26.3 的所有 EGL config 都不再带 ES1 位：

| Mesa | config 总数 | 带 `EGL_OPENGL_ES_BIT` | Godot 查到几个 |
|---|---|---|---|
| 26.2.7 | 225 | 125 | 64，正常 |
| 26.3.1 | 180 | **0** | **0，崩** |

两边各自都合理：Mesa 说 ES1 早该退休，Godot 说 EGL 给了默认值。合在一起就是新系统上打不开。

这种 bug 最难的地方是它不告诉你缺了什么，只说 `config_count == 0`。

整理 issue 时还顺手发现另一个问题：`attribs_layered` 那个数组里 `EGL_GREEN_SIZE` 写了两遍，`EGL_BLUE_SIZE` 漏了。一起报了。

### 提 issue

我让 Pi 整理了复现步骤、Mesa 版本对比、那段缺 `EGL_RENDERABLE_TYPE` 的源码位置，提交到 godotengine/godot：

> **#125651** Compatibility renderer fails on Mesa 26.3: eglChooseConfig() returns 0 configs because EGL_RENDERABLE_TYPE defaults to EGL_OPENGL_ES_BIT

07:32 提的。八小时后，核心成员 bruvzg 回了一条：

> Specify EGL_RENDERABLE_TYPE, matching the API used by `_get_platform_context_attribs()` (on desktop this is EGL_OPENGL_BIT), in both attribute lists:
>
> This will break it on system without desktop GL (most ARM platforms), and ANGLE on Windows and macOS. So it will need a more complicated check (separately for desktop GL and GLES3).

这句话否掉了我原来「加一行就完事」的想法。我 issue 里默认建议是桌面端指定 `EGL_OPENGL_BIT`，但 ARM 板子和 Windows/macOS 的 ANGLE 路径没有桌面 GL，照这么改会把那些平台弄挂。

十五分钟后他提了 PR #125663，当晚 22:36 合并。**从提 issue 到合并，15 小时。**

### 本地先扛过去

合并归合并，我手上的 4.7.2 不会自动变好。包一层：

```sh
#!/bin/sh
# ~/.local/bin/godot
if [ "$#" -eq 0 ]; then
    exec /usr/bin/godot --rendering-driver vulkan
fi
exec /usr/bin/godot "$@"
```

再加一个 `~/.local/share/applications/org.godotengine.Godot.desktop`，让启动器也走它。

这里有个小坑：`~/.local/share/applications/` 是这次才建的，而 walker 的数据源 `elephant` 早就启动了，既没读到新桌面项，也没在这个目录上挂 watcher。必须 `systemctl --user restart elephant`，否则从启动器点还是走 `/usr/bin/godot`，继续崩。

**局限**：这个包装只救「无参数启动」。用 Compatibility(OpenGL) 渲染的项目照样失败，那是上游的事。

## 现在的样子

| 层 | 是什么 |
|---|---|
| 内核 | `7.3.5-zen1-1-zen`，UKI 引导 |
| 桌面 | niri 26.04 + ironbar + walker + swaync |
| 终端 | ghostty + zsh + starship |
| 输入法 | fcitx5 + 雾凇 |
| 登录 | plymouth → kmscon（22px）→ ly 1.5.0（自编译） |
| 配色 | 桌面 One Dark Pro，登录层 Catppuccin Mocha |
| 包 | 837 装 / 120 显式 / 27 AUR |

Godot 还跑在包装脚本上，等 Arch 仓库的 4.7.2 带上游那个 commit。等哪天 `pacman -Syu` 之后它自己好了，我就把 `~/.local/bin/godot` 删掉。

这六天里反复出现的一件事：配置文件看起来对，实际不生效。plymouth 的 `pipefail`、kmscon 的命令行覆盖、ly 的包管理边界，都是这一类。
