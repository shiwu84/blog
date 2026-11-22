---
title: 用 Pi 把 Windows 11 装进那块 476G 的盘
description: 单盘 476G，Arch 是这周刚装的。从「先看看 ESP 多大」开始，四个多小时里缩了 260G、装了 Windows 11、修掉六个脚本 bug，最后卡在 1 毫秒的 DRM 竞态上。
pubDate: 2026-11-22
collection: 折腾日志
collectionDescription: 服务器、部署与各种工具折腾记录
tags:
  - 双系统
  - Arch Linux
  - Windows 11
  - UEFI
  - 分区
  - pi
---

11 月 21 号 16:15，我在终端里问 Pi：

> 当前为 Arch Linux 操作系统，我希望再安装一个 Windows 11 操作系统，怎么组成双系统最好？你先查看一下 ESP 分区多大？

「先看 ESP 多大」是我唯一有把握的判断。以前装双系统翻过车，ESP 太小，第二个引导器塞不进去，最后只能硬着头皮删分区。这次先确认。

Pi 把机器摸了一遍，回我的第一句是：

> **ESP = 1022 MiB，已用 151 MiB，剩 872 MiB —— 够用，不需要扩容。**

这里是华为 RLEF-XX，i5-12500H，16G 内存，单盘 476.94 GiB。

Arch 是这周刚装的。磁盘上只用掉 17G，分区只有两个。`p1`、`p2` 是 `/dev/nvme0n1p1`、`/dev/nvme0n1p2` 的简称，后面还会多出 `p3` 到 `p6`。

`p1` 1022M vfat，挂 `/boot`，里面是 systemd-boot 加两个 UKI。`p2` 475.9G btrfs，子卷 `@ @home @pkg @log`。没有磁盘 swap，只有 4G zram。

我自己加的约束是：Windows 给 200G，再留 60G 做两个系统的共享盘。

## 从尾巴上切一刀

方案确定得很快：`p2` 从尾部缩 260G，中间新建 60G 的 NTFS 共享盘，剩下的 200 GiB 未分配空间留给 Windows Setup。

不从盘头缩，因为那要把 17G 数据往前搬 260G。慢，而且没有收益。

从尾部缩只改 GPT 里 `p2` 的结束 LBA 一个字段。Pi 查了 `btrfs filesystem usage`，`Device unallocated: 491.68 GB`。所有 chunk 都挤在磁盘前 18G，尾巴是纯未分配。缩容变成纯元数据操作，秒级完成。

共享盘放中间也是故意的。Windows Setup 看到最后是一整块连续的未分配空间，点「下一步」就直接用掉，不需要你手填 MB 数。那一步最容易填错。

选 NTFS，因为内核自带的 `ntfs3` 有 journal，掉电之后还能恢复文件分配表。exFAT 没有日志，拔盘时机不对可能整张 FAT 都丢。

把 btrfs 暴露给 Windows 也没考虑。那要装第三方驱动，写入会毁卷。

## 「开启多智能体审阅脚本，确保无任何漏洞」

这是我在过程中说过的一句话。Pi 的回答有点意外：

> 这个 harness 没有派生子智能体的工具（只有 read/bash/edit/write 加两个 MCP）。所以我用能真正跑起来的实证测试代替空口审阅。

然后它去做了件事：用 `dd` 造了个 512MB 的镜像文件，建 GPT、建 btrfs，把 `50` 号脚本里那套 `sfdisk` 改写分区表的流程，在镜像上完整跑了一遍。

跑完就抓到一个真 bug：

```text
start=     3665920, size=      524288
```

`sfdisk` 回读出来是空格对齐的。脚本里写的是 `grep "start=$P3_START, size=$SHARE_SECT"`，永远匹配不上。

真机上的后果是：分区明明写成功了，脚本告诉你「p3 未写入」，让你回滚。我要是信了它，就白折腾一次。

这是我后来愿意继续让它动手的原因。它没有拿「我审阅过了，没问题」打发我。

## 七个「继续」，九个脚本

写脚本那段，我连着发了七次「继续」。

不是它写得慢，是网络。自建节点（VMrack）的流量用光了，发送直接报连接失败，重试几次才成。流量要到第二天 08:00 才重置。

最后交付九个脚本，全部 `bash -n` 加 `shellcheck` 零告警。中间修掉的东西里，有几个是我这种半吊子 shell 用户会反复踩的：

- `(( cond )) && cmd` 在 `set -e` 下，条件为假时整条返回 1，**脚本直接退出**。最常见的情况反而最容易炸。
- 用 `ls -lh` 的输出取文件名。中文 locale 下日期是 `11月 1日`（有空格）和 `11月16日`（没空格），字段数不一致，`$9` 就错位，文件名丢了两个。改成 `find -printf '%s\t%f'`。
- `# shellcheck disable=SC2016` 放在第一条命令之后，只影响紧邻的下一行，全文件失效。这个坑我看了半天才发现。
- 缩容脚本的幂等判断写反了。第一次跑，btrfs 缩了但 `sfdisk` 失败。重跑时判断「已经缩过了，跳过」，可分区表没改，于是照着旧尺寸改表，btrfs 会往 `p3` 里写，数据直接损坏。这个 bug 是修完之后又被测试抓出来的，比原来的还危险。

还有一个不是 shell 的问题：`cat <<EOF` 不转义 `\033`，颜色码会当字面量打出来。

## 备份 11G，最后只剩 913M

缩分区之前得先备份。它先问我有没有备份介质：`lsblk` 里只有一个 64G 的 Ventoy U 盘，没看到移动硬盘，于是把这个当成计划里唯一的真空。

我告诉它，Ventoy 不只能放 ISO，普通文件也能放，可以拿来备份。它没直接信，去翻了 `ventoy.json`：`VTOY_DEFAULT_SEARCH_ROOT` 的值是 `/ISO`，所以根目录下的备份文件不会出现在启动菜单里。确认之后，备份就落在 U 盘根目录。

家目录 11G，但 Pi 先跑了一遍 `du`，把能重建的东西挑出来：

`.cache` 2.7G、`.rustup` 1.6G、`Projects` 里 2.6G 的 Rust `target/`、`aseprite/build` 1.1G，全排除。

剩 2.0G，`tar` 加 `zstd` 打完 913M，67242 个条目，写进 Ventoy 盘。

然后它做了一件我没想到的事：**拿备份反过来演练恢复**。

这不是形式主义。第一次校验报了错，说 `.ssh`、`.config`、`Projects` 全都「匹配 0 条」。查下去是校验脚本的问题：tar 目录条目在归档里是 `dir/` 带斜杠，`grep -qx` 精确匹配不上。备份是好的，校验逻辑是坏的。

没验证过的备份等于没有备份。这句话我以前只是听过。

## 17:30，缩了 260G

真正动分区表的命令长这样：

```bash
sudo bash ~/Projects/arch-changes/scripts/system/50-shrink-btrfs-for-windows.sh
```

输出比预想的顺：

```text
✓ p3 已写入：start=454952960 size=125829120
✓ p2 新尺寸已写入：size=452853760
✓ p1（ESP）分区条目与原样完全一致
```

`p1` 那条校验是后加的。原来只验 `p2` 和 `p3`，后来发现脚本用 `awk` 改分区表，万一 `p1` 那行被搞坏，ESP 就废了。多一条断言，成本一秒。

意外的是内核不用重启就看到了新分区表。原因是：`--no-tell-kernel` 只拦住了 `sfdisk` 自己发 ioctl，但 udev 检测到块设备变化，自己触发了 `BLKRRPART` 重扫。

我贴了 `lsblk`，`p2` 已经是 215.9G，`p3` 60G 裸分区，四个子卷都在，`systemctl --failed` 零项，启动 16.5 秒。

然后 Pi 说：「其实现在不必先重启，直接跑 51 更省一次重启。」

我回了一句：

> 我不是应该先重启再跑 51 吗？

它承认自己错了，而且说清了为什么错：

> 我当时想的是「51 会改 fstab，fstab 必须重启才能验证，所以不如合并成一次重启」。这个推理只看效率，没看故障隔离。改完分区表这种高风险操作后，必须先证明系统能从新分区表正常启动，再动下一个东西。

它还补了一句：内核是在 `p2` 正被挂载使用的情况下把它缩小的，属于 `BLKRRPART` 的边缘场景，正常路径下会返回 `EBUSY` 拒绝。

「它现在成功了，但我不确定是完整的重扫，还是 udev 逐分区做的部分更新。没经过一次完整启动，我无法证明它一致。」

这句话我记下来了。省一次重启，代价是把「分区表」和「fstab」两个变量搅在一起，出事分不清是谁的锅。

## `mkfs.ntfs` 不在 `ntfs-3g` 里

重启验证通过，跑 51 格式化共享盘。

第一次挂在这：

```text
! 缺 ntfs-3g 包，正在安装（内核 ntfs3 驱动本身不需要它，但需要 mkfs.ntfs）
...
! 仍然找不到 mkfs.ntfs
```

Pi 一开始怀疑是 bash 的命令哈希表缓存，`hash -r` 一下就好。查证之后发现不是：

**Arch 把 `mkfs.ntfs` 拆到了 `ntfsprogs` 包里，`ntfs-3g` 只提供挂载驱动。**

这是按 Debian/Ubuntu 习惯想当然。更难看的是，我第一次贴给它的安装输出里就有一行 `ntfsprogs: userspace utilities`，它漏看了。

好消息是脚本在格式化之前就退出了，`p3` 还是干净裸分区，fstab 没动，`/data` 没建。没有半途状态，改装 `ntfsprogs` 重跑就行。

格式化时打的卷标是 `SHARE`。Linux 侧 `lsblk` 的 LABEL 列、`/dev/disk/by-label/SHARE` 都读它；到了 Windows 里，这个盘显示为 `Share`，盘符 D:。

`/etc/fstab` 最后长这样：

```text
UUID=4727CAA213A7BD0E /data ntfs3 rw,uid=1000,gid=1000,fmask=0133,dmask=0022,iocharset=utf8,windows_names,noatime,discard,nofail 0 0
```

`nofail` 是最重要的一个。哪天 Windows 没正常关机，NTFS 卷带着 dirty flag，`ntfs3` 会拒绝挂载。没有 `nofail`，systemd 判定 mount unit 失败，直接把你扔进 emergency shell，整机起不来。

有它，`/data` 缺席，系统照常启动。

`fmask=0133` 去掉了所有执行位。否则 NTFS 上每个文件在 Linux 看着都是 755，git 会把 `.sh` 记成 `100755`，一提交就脏。

## Windows 侧

Ventoy 盘里那个 Win11 ISO，一开始根本不在启动菜单里。

我也想不起来它去哪了。之前装过一次 Windows 11，装完就把镜像扔进了回收站，这事我自己都忘了。Pi 翻了 `.Trash-1000` 把它找回来。它不在 `/ISO` 下，所以启动菜单里没有。

回收站占了 31.6 GiB，可用空间只剩 12G。

镜像本身是好的。卷标 `CCCOMA_X64FRE_ZH-CN_DV9`，制作工具 `CDIMAGE 2.56`，`install.wim` 7.06 GiB。

SHA-256 是 `7408581e67bc455ebaafb9230e531abf45b1c8864a22114a1b03893f897102e4`。

19:00 前后装完。回到 Arch 一看，分区比我预期的还干净：`p1`、`p2`、`p3` 的 PARTUUID 一个都没变，后面多出 `p4` 到 `p6`，是 Windows 的 MSR、C: 和 WinRE。

`/data` 自动挂上了，说明 Windows 的快速启动确实关掉了。`root=PARTUUID` 一字未变，所以 Arch 正常启动。

只有一处如预期地坏了：

```text
BootOrder: 0002,2001,0003,2002,2003
           ↑ Windows 插到第一位
```

跑 60 号脚本改回 `0003,0002,2001,2002,2003`。顺便确认 `bootctl list` 里 Windows 自动出现了，systemd-boot 自己扫的，没手工写菜单项。

## 时钟：RTC 是 UTC 这件事是个假象

在 Windows 里我按指引跑了 `powercfg /h off`，然后问：

> `reg add ... RealTimeIsUniversal ...` 这个真的有必要吗？查一下

Pi 先做了一个反直觉的观察：装完 Windows 之后，RTC 竟然还是 UTC。

```bash
/sys/class/rtc/rtc0/time = 11:09:14
# 本地时间 19:09 CST
```

查下去才明白，这不是 Windows 变乖了，是内核在替它擦屁股：

```text
CONFIG_RTC_HCTOSYS=y   ← 开机：RTC → 系统时钟（按 UTC 读）
CONFIG_RTC_SYSTOHC=y   ← 运行中：系统时钟 → RTC，每 11 分钟一次
```

systemd 从 v256 起把 `systemd-hwclock` 二进制移除了，RTC 写回完全交给内核。所以流程是：

1. Windows 关机，把 RTC 写成 19:09（本地时间）
2. Arch 开机，内核把 19:09 当 UTC 读，系统时间变成次日 03:09
3. NTP 校正回 11:09 UTC
4. 11 分钟后，内核把正确的 UTC 写回 RTC

你之所以看到 RTC 是 UTC，是因为 Arch 已经跑了超过 11 分钟。

**有网络时，第 2 步到第 3 步之间只错几秒；离线时，整个会话都错 8 小时。** 对编译、git 提交、snapper 快照时间戳都是实打实的影响。

注册表那个键还是加了。微软不正式支持 `RealTimeIsUniversal`，但 Arch Wiki 推荐，前提是关了快速启动。休眠恢复路径会绕过 RTC 读取。

## 第一件：十五秒的谜

重启后我发现两件事。第一件：

> 不是 5 秒，是 15 秒。

`loader.conf` 里明明写的是 `timeout 5`。查了 EFI 变量才发现：

```bash
LoaderConfigTimeout-4a67b082-0a4c-41cf-b6c7-440b29bb8c4f
# 10 字节 = 4 字节属性 + 6 字节值 = UTF-16 的 "15"
```

**`LoaderConfigTimeout` 这个 EFI 变量的优先级高于 `loader.conf`。**

60 号脚本只改了文件，没查变量，所以我的 5 秒被完全盖掉。修法一行：

```bash
sudo bootctl set-timeout 5
```

顺带把 `xxd` 不存在这个坑也记了一笔：它是从别的发行版带过来的习惯，Arch 默认不装。

## 第二件：一毫秒的谜

> 重启时选中 Arch Linux 回车后不显示 ly（可以盲输密码回车进入 niri），但是 Ctrl+Alt+{2,3,4,5,6} 都可以显示 ly。

第一反应是 VT 切换能救。我试了：

> 确实是偶发，但是切换到 Ctrl+Alt+F2，再切换为 1 还是黑屏。

这条修正很关键。它排除了「切换一下就好」的可能：kmscon 一旦 DRM 初始化失败，就永久坏掉，不会自己重试。

查日志，时间线只差 1 毫秒：

```text
20:27:58.784 Finished Terminate Plymouth Boot Screen
20:27:58.785 Started TUI display manager using KMSCON (tty1)
```

`ly@tty1.service` 是 inactive 的。tty1 上跑的是 `ly-kmsconvt@tty1.service`，也就是 `kmscon` 在跑 `ly-dm`。

它已经有 `After=plymouth-quit-wait.service`。但那只等 plymouth 进程退出，不等 i915 释放 DRM master。kmscon 冲上去设模式，失败。

决定性证据是日志里的不一致：

```text
kmscon[894]: vt: using tty /dev/tty3
kmscon[894]: terminal: Display pci-0000:00:02.0[eDP-1] with backend [drm3d]
```

tty3 的 kmscon 有 `terminal: Display` 这行；tty1 的（PID 855）完全没有。说明它静默跳过了 DRM 初始化。而 tty3 晚 7 秒启动，没人和它抢，所以正常。

修法是给 tty1 的 kmscon 加一个 drop-in，等 plymouth 退出后再睡 1 秒：

```bash
/etc/systemd/system/ly-kmsconvt@tty1.service.d/10-wait-drm.conf
```

这跟双系统没关系。ly、kmscon、plymouth 是 21 号上午配的。配的时候一次都没撞上，因为它是偶发的。

下午反复重启，才轮到它。抢赢了正常，抢输了就一直黑，不会自己重试。以前菜单不露脸，我也没盯着 tty1 那几秒看。

## 收工

20:30，两个问题都验完：菜单倒计时 5 秒，tty1 正常显示 ly。

把整个过程记进了 `CHANGES-2026-11-19_21.md` 第 10 章，612 行，含六个 bug 的根因和完整回滚命令。快照打了，包清单更新了。

它有两件事做得对。动真盘之前，先在镜像文件上把流程跑一遍。我反问之后，承认上一条建议是错的。

猜错的地方也很典型：`ntfs-3g` 包里没有 `mkfs.ntfs`、`loader.conf` 一定生效、改完分区表可以先不重启。

全是**默认值**问题。它默认了 Debian 的包拆分方式，默认配置文件是唯一真相源，默认内核视图可信。

我唯一插上嘴的地方，是它说「先不重启更省」之后反问的那句。**一次只动一个变量**，听起来像废话，但省下的那次重启，代价可能是四个小时都查不清是谁的锅。

代价也说清楚。`p2` 缩容之后不可逆，要还原得先删掉 `p3` 到 `p6` 四个分区，再把 btrfs 扩回去。

ESP 从 151M 涨到 183M，剩 840M。BIOS 还是 1.28 / 2024-05-18。华为不上 LVFS，Linux 里升不了，只能进 Windows 用电脑管家。

## 现在的样子

| 分区 | 大小 | 文件系统 | 用途 |
|---|---|---|---|
| p1 | 1022M | vfat | ESP，挂 `/boot` |
| p2 | 215.94G | btrfs | Arch 根，子卷没动 |
| p3 | 60G | NTFS | 共享盘；Linux 卷标 `SHARE`、挂 `/data`；Windows 盘符 D:、显示为 `Share` |
| p4 | 16M | — | Windows MSR |
| p5 | 199.2G | NTFS | Windows C: |
| p6 | 841M | NTFS | Windows WinRE |

`BootOrder: 0003,0002,2001,2002,2003`，Linux 第一，Windows 第二。菜单倒计时 5 秒。`bootctl list` 里那条 Windows 是 systemd-boot 自己扫出来的，没手写菜单项。

时钟两边都按 UTC 解释。`/data` 用 `ntfs3` 挂着，带 `nofail`，哪天 Windows 没正常关机也不会拖垮启动。`systemctl --failed` 零项。

这些我暂时都不打算动。
