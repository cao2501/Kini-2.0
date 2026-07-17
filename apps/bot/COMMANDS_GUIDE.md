# 📖 Hướng Dẫn Lệnh & Chức Năng — Kini Bot 2.0

> Tài liệu này được tổng hợp **trực tiếp từ source code** của toàn bộ **29 module** với đầy đủ tham số thực tế.
> Cập nhật lần cuối: **2026-07-17**

---

## 📑 Mục lục nhanh

| # | Module | Lệnh chính |
|---|--------|-----------|
| 01 | 🏆 Achievements | `/achievements` |
| 02 | 🤖 AI Assistant | `/ai` |
| 03 | 📊 Analytics | `/analytics`, `/util userinfo` |
| 04 | 🛡️ Anti-Nuke | `/antinuke` |
| 05 | 💾 Backup | `/backup` |
| 06 | 💰 Economy (Coins) | `/eco` |
| 07 | 💳 VND Economy | `/vnd` |
| 08 | 🏪 Shop | `/shop` |
| 09 | 🎒 Inventory | `/inventory` |
| 10 | 🎁 Giveaway | `/giveaway` |
| 11 | 🏠 Guild Setup | `/setup` |
| 12 | 🌟 Leveling | `/leveling`, `/rank`, `/leaderboard` |
| 13 | 📋 Logging | `/logging` |
| 14 | 💞 Marriage | `/marry` |
| 15 | 🎯 Missions | `/missions` |
| 16 | 🔨 Moderation | `/ban`, `/kick`, `/warn`, `/timeout`, `/purge` |
| 17 | 🎵 Music | `/music` |
| 18 | 🗳️ Polls | `/poll` |
| 19 | 💎 Premium | `/premium` |
| 20 | 🎭 Reaction Roles | `/reactionrole` |
| 21 | 🚨 Scam Detection | *(Auto — Không có lệnh slash)* |
| 22 | 👥 Staff & Booking | `/staff`, `/book`, `/salary`, `/star`, `/embed`, `/reactbill` |
| 23 | ⭐ Starboard | `/starboard` |
| 24 | 💡 Suggestions | `/suggest` |
| 25 | 🔊 Temp Voice | `/vc` |
| 26 | 🎫 Tickets | `/ticket` |
| 27 | 🛠️ Utility | `/util`, `/announce`, `/help` |
| 28 | ✅ Verification | `/verify` |
| 29 | 👋 Welcome & Leave | `/welcome` |
| 30 | 👑 Owner | `/owner` |

---

## 🏆 1. Achievement System (Hệ thống Thành tựu)

Quản lý danh hiệu/thành tựu thành viên có thể mở khóa trong server. Thành tựu ẩn (`hidden`) chỉ hiển thị khi đã được mở khóa. Sau khi nhận thành tựu, bot sẽ tự động gửi DM thông báo cho người dùng.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/achievements list [user]` | Mọi người | Xem danh sách thành tựu đã mở khóa của bạn hoặc người khác |
| `/achievements all` | Mọi người | Xem toàn bộ thành tựu trong server (thành tựu ẩn hiển thị dấu ❓ cho đến khi mở khóa) |
| `/achievements create <name> <description> <icon> [hidden]` | Manage Server | Tạo thành tựu mới. Icon hỗ trợ cả custom emoji của server |
| `/achievements award <user> <name>` | Manage Server | Trao trực tiếp thành tựu cho thành viên, bot tự DM thông báo |

---

## 🤖 2. AI Assistant (Trợ lý AI)

Tích hợp Google Gemini AI với khả năng tìm kiếm thông tin thực tế (thời tiết, tin tức qua DuckDuckGo) và ghi nhớ lịch sử hội thoại tối đa **20 lượt**. Model AI: `gemini-3.1-flash-lite` (fallback: `gemini-3-flash-preview`).

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/ai chat <message> [remember]` | Mọi người | Trò chuyện với AI. Mặc định `remember=true` (ghi nhớ lịch sử). AI tự động tra thời tiết, tỷ giá, tin tức nếu câu hỏi liên quan |
| `/ai ask <question>` | Mọi người | Hỏi nhanh, không lưu lịch sử |
| `/ai summarize <text>` | Mọi người | Tóm tắt văn bản thành 3-5 điểm chính |
| `/ai translate <text> <to>` | Mọi người | Dịch sang: Việt / Anh / Nhật / Hàn / Trung / Pháp / Đức / Tây Ban Nha |
| `/ai imagine <prompt>` | Mọi người | Tạo mô tả hình ảnh chi tiết theo phong cách nghệ sĩ (dùng với Midjourney, Stable Diffusion) |
| `/ai analyze <content>` | Mọi người | Phân tích văn bản (cảm xúc, chủ đề) hoặc phân tích code (lỗi, cải thiện) |
| `/ai clear` | Mọi người | Xóa toàn bộ lịch sử hội thoại của bạn |

> **Lưu ý:** Yêu cầu `GEMINI_API_KEY` trong `.env`. Có cooldown 5 giây giữa các lệnh.

---

## 📊 3. Analytics (Phân tích & Thống kê)

Theo dõi hoạt động server và cá nhân dựa trên dữ liệu tin nhắn và thời gian thoại lưu trong DB.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/analytics overview` | Mọi người | Tổng quan: tin nhắn hôm nay / 7 ngày / 30 ngày, số thành viên, trung bình tin nhắn/ngày |
| `/analytics messages` | Mọi người | Biểu đồ cột tin nhắn 7 ngày gần nhất (ASCII chart) |
| `/analytics members` | Mọi người | Thống kê thành viên: tổng, người thật, bot, mới tham gia 7 ngày |
| `/analytics top` | Mọi người | Top 5 thành viên nhiều XP nhất và Top 5 giàu nhất (coin) |
| `/util userinfo [user]` | Mọi người | Thống kê cá nhân chi tiết: tổng tin nhắn, tin nhắn 1/7/30 ngày, giờ thoại 1/7/30 ngày |

---

## 🛡️ 4. Anti-Nuke (Chống Phá Server)

Hệ thống giám sát hành vi phá hoại hàng loạt (xóa kênh, xóa role, ban hàng loạt, tạo webhook) với xử lý tự động trong vòng 10 giây.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/antinuke enable` | Administrator | Bật bảo vệ Anti-Nuke |
| `/antinuke disable` | Administrator | Tắt bảo vệ Anti-Nuke |
| `/antinuke config <alert_channel> [action] [channel_delete_threshold] [role_delete_threshold] [ban_threshold] [auto_lockdown] [anti_webhook]` | Administrator | Cấu hình toàn diện. Hành động: `BAN` / `KICK` / `STRIP` (thu hồi role) / `LOG_ONLY`. Ngưỡng mặc định: channel/role xóa 3x/10s, ban 5x/10s |
| `/antinuke whitelist <user/role>` | Administrator | Thêm user hoặc role vào danh sách tin cậy (bỏ qua Anti-Nuke) |
| `/antinuke info` | Administrator | Xem trạng thái, cấu hình, danh sách whitelist hiện tại |

---

## 💾 5. Server Backup (Sao lưu & Khôi phục)

Lưu trữ toàn bộ cấu trúc kênh và role của server kèm permission overwrite. Giới hạn tối đa **5 bản** mỗi server.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/backup create <name>` | Administrator | Tạo bản sao lưu (roles, channels, permissions). Thông báo số role/kênh và dung lượng file |
| `/backup list` | Administrator | Danh sách bản sao lưu kèm ID, tên, dung lượng, thời gian tạo |
| `/backup restore <id>` | Administrator | Khôi phục từ bản sao lưu. **Hiện bảng xác nhận nguy hiểm** trước khi thực thi — xóa toàn bộ kênh/role hiện tại và tái tạo lại. Không thể hoàn tác! |
| `/backup delete <id>` | Administrator | Xóa bản sao lưu (nhập 8 ký tự cuối của ID) |

---

## 💰 6. Economy — Coin System (Kinh tế nội bộ)

Hệ thống coin nội bộ server. Số dư hiển thị dưới dạng **thẻ card hình ảnh** đẹp. Khi bị cướp, tiền trong ngân hàng được bảo vệ.

| Lệnh | Cooldown | Mô tả |
|------|----------|-------|
| `/eco balance [user]` | — | Xem ví (wallet) + ngân hàng (bank) + gems + streak hàng ngày dưới dạng card hình ảnh |
| `/eco daily` | 24 giờ | Nhận **200 coins** hàng ngày |
| `/eco weekly` | 7 ngày | Nhận **1.000 coins** hàng tuần |
| `/eco work` | 1 giờ | Đi làm ngẫu nhiên (lập trình viên, bác sĩ, giáo viên...) nhận 50–400 coins |
| `/eco crime` | 2 giờ | Phạm tội: cơ hội nhận nhiều coins hoặc bị phạt nặng |
| `/eco rob <user>` | — | Cướp tiền người khác (tỷ lệ 50% thành công, thất bại bị phạt). Chỉ cướp được tiền trong ví, không cướp được ngân hàng |
| `/eco transfer <user> <amount>` | — | Chuyển coins cho người khác (trừ tiền ví) |

> **Ghi chú:** `/eco deposit` và `/eco withdraw` không có lệnh slash riêng — chức năng gửi/rút ngân hàng được quản lý qua hệ thống VND (`/vnd`).

---

## 💳 7. VND Economy (Kinh tế VND liên kết ngân hàng)

Hệ thống tiền tệ VND thực (liên kết VietQR). Dùng để thuê nhân viên, mua nhẫn cưới, chuyển khoản nội bộ.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/vnd balance [member]` | Mọi người | Xem số dư VND của bạn hoặc thành viên khác (dưới dạng card hình ảnh) |
| `/vnd pay <member> <amount>` | Mọi người | Chuyển khoản VND cho thành viên khác (tối thiểu 1 VND) |
| `/vnd deposit <amount>` | Mọi người | Tạo lệnh nạp VND tự động qua VietQR (tối thiểu 1.000 VND). Bot gửi mã QR ngân hàng |
| `/vnd admin add <member> <amount>` | Manage Guild | Cộng tiền VND cho thành viên |
| `/vnd admin remove <member> <amount>` | Manage Guild | Trừ tiền VND của thành viên |
| `/vnd admin set <member> <amount>` | Manage Guild | Đặt lại số dư VND về con số cụ thể |

---

## 🏪 8. Shop (Cửa hàng)

Cửa hàng server với 2 danh mục: **GENERAL** (vật phẩm thường, mua bằng coins) và **RING** (nhẫn cưới, mua bằng VND). Hỗ trợ emoji tùy chỉnh, ảnh sản phẩm.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/shop list [category]` | Mọi người | Xem tất cả sản phẩm (GENERAL/RING). Kèm menu dropdown để xem chi tiết từng sản phẩm |
| `/shop buy <category> <id>` | Mọi người | Mua sản phẩm theo ID (số thứ tự trong /shop list). Loại ROLE sẽ tự động cấp role |
| `/shop add <name> <price> <type> [category] [currency] [role] [description] [stock] [image/file] [emoji]` | Manage Guild | Thêm sản phẩm vào shop. Type: ROLE / CUSTOM. Currency: ECO (coins) / VND |
| `/shop remove <name>` | Manage Guild | Xóa sản phẩm khỏi shop |
| `/shop edit <category> <id> [name] [price] [stock] [enabled] [image/file] [description] [emoji]` | Manage Guild | Chỉnh sửa sản phẩm: giá, kho, bật/tắt, ảnh, mô tả, emoji |
| `/shop give <category> <id> <user> [quantity]` | Manage Guild | Admin tặng sản phẩm trực tiếp cho người dùng (không trừ tiền) |

> **Nhẫn cưới mặc định trong RING shop:** Stardust (500.000d), Illusion (700.000d), Nebula Core (900.000d), Constellation (1.200.000d), Horizon (1.500.000d), Singularity (2.000.000d), Custom (2.500.000d).

---

## 🎒 9. Inventory (Kho đồ cá nhân)

Quản lý vật phẩm người dùng đã mua từ shop.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/inventory view` | Mọi người | Xem toàn bộ vật phẩm đang có trong kho (nhóm theo GENERAL và RING) |
| `/inventory give <category> <id> <user> [quantity]` | Mọi người | Tặng/chuyển vật phẩm trong kho cho người khác (trừ số lượng trong kho của bạn) |

---

## 🎁 10. Giveaway (Phát quà)

Tổ chức sự kiện bốc thăm tự động với nút tham gia, đếm ngược real-time và reroll.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/giveaway start <prize> <duration> [winners] [ping]` | Manage Guild | Tạo giveaway. Thời gian: 1h, 1d, 30m... Hỗ trợ ping role/everyone kèm theo |
| `/giveaway end <id>` | Manage Guild | Kết thúc sớm và chọn người thắng |
| `/giveaway reroll <id>` | Manage Guild | Chọn lại người thắng ngẫu nhiên mới |
| `/giveaway pause <id>` | Manage Guild | Tạm ngưng / Tiếp tục đếm thời gian |
| `/giveaway list` | Manage Guild | Xem danh sách giveaway đang diễn ra |

---

## 🏠 11. Guild Management (Cài đặt Server)

Thiết lập cơ bản bot cho từng server.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/setup info` | Manage Guild | Xem cấu hình hiện tại (ngôn ngữ, múi giờ, prefix) |
| `/setup language <lang>` | Manage Guild | Ngôn ngữ bot: vi (Tiếng Việt) hoặc en (English) |
| `/setup timezone <timezone>` | Manage Guild | Cài đặt múi giờ (vd: Asia/Ho_Chi_Minh) |
| `/setup prefix <prefix>` | Manage Guild | Đặt tiền tố lệnh text cổ điển (prefix commands) |

---

## 🌟 12. Leveling System (Hệ thống Cấp độ)

Thành viên tích lũy XP qua nhắn tin và hoạt động thoại. Hỗ trợ **role rewards** tự động khi đạt level. Thẻ rank được render dưới dạng ảnh đẹp.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/rank [user]` | Mọi người | Xem thẻ rank (level, XP, thứ hạng server) dưới dạng card hình ảnh |
| `/leaderboard` | Mọi người | Bảng xếp hạng Top thành viên nhiều XP nhất (hiển thị Top 10) |
| `/leveling setup [levelup_channel] [cooldown] [enabled]` | Manage Guild | Cấu hình: kênh thông báo lên level, cooldown giữa XP (10-3600 giây, mặc định 60s), bật/tắt module |
| `/leveling addrole <level> <role> [type]` | Manage Guild | Gắn role reward vào level. Type: ADD (cấp role) hoặc REMOVE (thu hồi role) |
| `/leveling removerole <level> <role>` | Manage Guild | Xóa cấu hình role reward khỏi level |
| `/leveling roleinfo` | Manage Guild | Xem danh sách tất cả level rewards đã cấu hình |
| `/leveling info` | Manage Guild | Xem cấu hình leveling hiện tại của server |
| `/leveling setxp <user> <xp>` | Manage Guild | Chỉnh thủ công điểm XP (level tự động cập nhật theo) |
| `/leveling resetxp <user>` | Manage Guild | Reset về 0 XP và level 0 |

---

## 📋 13. Logging System (Nhật ký sự kiện)

Ghi nhật ký tự động các sự kiện server vào kênh cấu hình sẵn.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/logging set <event_type> <channel>` | Manage Guild | Gắn kênh log cho loại sự kiện cụ thể |
| `/logging disable <event_type>` | Manage Guild | Tắt log cho loại sự kiện đó |
| `/logging list` | Manage Guild | Xem toàn bộ kênh log đang được cấu hình |

**Các loại sự kiện hỗ trợ:** MESSAGE_EDIT, MESSAGE_DELETE, MEMBER_JOIN, MEMBER_LEAVE, MEMBER_BAN, MEMBER_UNBAN, ROLE_CREATE, ROLE_DELETE, CHANNEL_CREATE, CHANNEL_DELETE, VOICE_JOIN, VOICE_LEAVE, MODERATION.

---

## 💞 14. Marriage System (Hệ thống Kết hôn)

Hệ thống kết hôn đầy đủ với cầu hôn, nhẫn cưới từ shop, profile đôi, điểm tình yêu hằng ngày và tùy biến giao diện.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/marry proposal <user> <ring> [emoji]` | Mọi người | Gửi lời cầu hôn. ring: ID hoặc tên nhẫn từ shop RING (cần mua trước). emoji: Chỉ dùng khi nhẫn loại Custom để đặt emoji biểu tượng |
| `/marry profile` | Mọi người | Xem thông tin hôn nhân hiện tại (partner, nhẫn, ngày kết hôn, điểm tình yêu, streak) |
| `/marry divorce` | Mọi người | Đơn phương chia tay (hủy hôn nhân) |
| `/marry luv` | Mọi người | Tương tác hàng ngày để nhận điểm tình yêu và duy trì streak |
| `/marry caption <text>` | Mọi người | Đổi lời chú thích hiển thị trên profile hôn nhân |
| `/marry thumbnail [url] [file]` | Mọi người | Cài ảnh nhỏ (thumbnail) cho embed profile |
| `/marry image [url] [file]` | Mọi người | Cài ảnh lớn cho embed profile |
| `/marry color <color>` | Mọi người | Thay đổi màu viền embed profile (mã hex, vd: 0xff7bb5) |

> **Lưu ý:** Cần có nhẫn cưới trong kho (/inventory) trước khi cầu hôn. Nhẫn sẽ bị tiêu thụ khi kết hôn.

---

## 🎯 15. Daily Missions (Nhiệm vụ hàng ngày)

Hệ thống nhiệm vụ giúp thành viên kiếm phần thưởng và duy trì streak điểm danh.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/missions list` | Mọi người | Xem nhiệm vụ hàng ngày/tuần của bạn và tiến độ |
| `/missions claim <mission_id>` | Mọi người | Nhận thưởng sau khi hoàn thành nhiệm vụ |
| `/missions streak` | Mọi người | Xem chuỗi điểm danh hàng ngày |
| `/missions create <name> <description> <type> <task_type> <target> <rewards>` | Administrator | Tạo nhiệm vụ mới cho server |

---

## 🔨 16. Moderation (Quản trị & Kiểm duyệt)

Bộ công cụ kiểm duyệt đầy đủ với hỗ trợ **ban tạm thời**, **warn tích điểm phạt** và **purge nâng cao**.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/ban <user> [reason] [delete_messages_days] [duration]` | Ban Members | Cấm vĩnh viễn hoặc tạm thời (vd: duration=1d). Hỗ trợ xóa tin nhắn gần đây |
| `/kick <user> [reason]` | Kick Members | Trục xuất thành viên khỏi server |
| `/warn add <user> <reason> [points]` | Manage Messages | Thêm cảnh cáo, cộng điểm phạt tích lũy |
| `/warn remove <warn_id>` | Manage Messages | Xóa một cảnh cáo theo ID |
| `/warn history <user>` | Manage Messages | Xem lịch sử cảnh cáo của thành viên |
| `/warn clear <user>` | Manage Messages | Xóa toàn bộ lịch sử cảnh cáo |
| `/timeout <user> <duration> [reason]` | Moderate Members | Cấm chat tạm thời (Timeout) |
| `/untimeout <user> [reason]` | Moderate Members | Gỡ timeout |
| `/purge <type> <amount> [filter]` | Manage Messages | Xóa hàng loạt tin nhắn. Type: all / user / bot / link / attachment / regex / emoji |

---

## 🎵 17. Music Player (Nhạc Voice)

Phát nhạc từ YouTube trực tiếp trong kênh thoại. Hỗ trợ hàng đợi, shuffle, loop và điều chỉnh âm lượng.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/music play <query>` | Mọi người | Phát nhạc từ URL YouTube hoặc tìm kiếm theo từ khóa |
| `/music skip` | Mọi người | Bỏ qua bài hiện tại |
| `/music stop` | Mọi người | Dừng hoàn toàn, xóa hàng đợi và rời kênh thoại |
| `/music pause` | Mọi người | Tạm dừng / Tiếp tục |
| `/music queue` | Mọi người | Xem danh sách hàng đợi |
| `/music shuffle` | Mọi người | Trộn ngẫu nhiên hàng đợi |
| `/music loop` | Mọi người | Chế độ lặp: OFF → TRACK (lặp bài) → QUEUE (lặp danh sách) |
| `/music volume <level>` | Mọi người | Chỉnh âm lượng từ 0 đến 200 |
| `/music nowplaying` | Mọi người | Xem bài đang phát kèm ảnh thumbnail và thanh tiến trình |
| `/music remove <position>` | Mọi người | Xóa bài tại vị trí cụ thể trong hàng đợi |
| `/music clear` | Mọi người | Xóa toàn bộ hàng đợi (giữ lại bài đang phát) |

---

## 🗳️ 18. Polls (Khảo sát & Bình chọn)

Tạo khảo sát nhiều lựa chọn với thanh tiến trình trực quan. Hỗ trợ chế độ ẩn danh.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/poll create <question> <options> [duration] [anonymous]` | Mọi người | Tạo khảo sát. Các tùy chọn ngăn cách bằng dấu phẩy. Hỗ trợ đặt thời hạn và ẩn danh |
| `/poll end <message_id>` | Manage Guild | Kết thúc sớm và hiển thị kết quả cuối cùng |

---

## 💎 19. Premium Manager

Quản lý gói nâng cấp cao cấp cho từng server.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/premium info` | Mọi người | Xem trạng thái Premium của server hiện tại (gói, ngày hết hạn) |
| `/premium activate <guild_id> <days> [plan]` | Bot Owner | Kích hoạt Premium cho server. Gói: BASIC / PRO / ULTIMATE |
| `/premium revoke <guild_id>` | Bot Owner | Thu hồi quyền Premium |
| `/premium list` | Bot Owner | Danh sách toàn bộ server đang Premium |

---

## 🎭 20. Reaction Roles (Tự chọn vai trò)

Cấp vai trò tự động qua nút bấm hoặc dropdown menu.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/reactionrole add <channel> <title> <description> [image_url]` | Manage Roles | Tạo bảng Reaction Roles mới trong kênh chỉ định |
| `/reactionrole button <message_id> <emoji> <role> [label] [style]` | Manage Roles | Thêm nút chọn role vào tin nhắn có sẵn. Style: Primary / Secondary / Success / Danger |
| `/reactionrole dropdown <message_id> <role> <label> [emoji] [description]` | Manage Roles | Thêm tùy chọn role vào dropdown (select menu) |
| `/reactionrole list` | Manage Roles | Xem danh sách tin nhắn Reaction Roles đang hoạt động |

---

## 🚨 21. Scam Detection (Phát hiện Lừa đảo)

Module hoàn toàn tự động, **không có lệnh slash**. Hệ thống tự động phát hiện và xử lý link lừa đảo, phishing, spam trong server.

- Tự động quét mọi tin nhắn trong server
- Phát hiện link nguy hiểm (Discord Nitro giả, phishing site, crypto scam...)
- Gửi cảnh báo và xóa tin nhắn vi phạm
- Không cần cấu hình — module tự kích hoạt khi được load

---

## 👥 22. Staff & Booking System (Nhân viên & Đặt lịch)

Hệ thống quản lý hồ sơ nhân viên, VIP, đặt lịch theo giờ và tính lương tự động. Liên kết với hệ thống VND để thanh toán.

### Staff Management

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/staff add <key> <name> <type> [title] [user] [thumbnail/file] [color] [description] [image/file]` | Manage Guild | Thêm nhân viên mới. key: mã phụ duy nhất (vd: k1). Type: EMPLOYEE / STAFF / VIP. Hỗ trợ ảnh upload trực tiếp hoặc URL |
| `/staff edit <key> [new_key] [name] [type] [title] [user] [thumbnail/file] [color] [description] [image/file]` | Manage Guild | Chỉnh sửa hồ sơ nhân viên |
| `/staff remove <key>` | Manage Guild | Xóa nhân viên khỏi hệ thống |
| `/staff view [key]` | Mọi người | Xem hồ sơ nhân viên (không nhập key = danh sách tổng) |
| `/staff list` | Mọi người | Xem danh sách toàn bộ nhân viên |
| `/staff setprice <key> <day_rate> <night_rate>` | Manage Guild | Đặt giá thuê ngày/đêm cho nhân viên |
| `/staff setfields <key> <fields>` | Manage Guild | Cài đặt các trường thông tin tùy chỉnh (emoji: label: value, phân cách bởi dấu phẩy) |

### Booking (Đặt lịch thuê nhân viên)

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/book <khach_hang> <nhan_vien> <so_gio> <loai_gia> [them_nguoi] [server_rieng] [su_dung_vi_luong]` | Mọi người | Thuê nhân viên theo giờ. loai_gia: DAY / NIGHT. Trừ tiền VND tự động từ khách hàng |

### Salary (Lương & Thanh toán)

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/salary xemluong` | Nhân viên | Xem chi tiết thu nhập cá nhân: số giờ, lương theo ca, tổng lương ví |
| `/salary tinhluong <VIEW/EXPORT>` | Manage Guild | Xem bảng lương toàn bộ nhân viên hoặc xuất file Excel/CSV |
| `/salary resetluong` | Manage Guild | Chốt lương: chuyển toàn bộ ví lương sang VND chính của nhân viên |
| `/salary truluong <key> <amount> [reason]` | Manage Guild | Khấu trừ lương trực tiếp vào ví lương |
| `/salary donate <key> <amount>` | Mọi người | Ủng hộ tiền VND trực tiếp cho nhân viên (tối thiểu 1.000 VND) |

### Tiện ích Staff khác

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/star` | Mọi người | Bảng xếp hạng Top 5 nhân viên có tổng giờ làm nhiều nhất (All-time) |
| `/embed send <channel> [title] [description] [color] [thumbnail/file] [image/file] [footer]` | Manage Guild | Tạo và gửi embed tùy chỉnh vào kênh bất kỳ |
| `/reactbill simple [title] [description]` | Mọi người | Tạo bảng đăng ký đơn giản với nút React/Hủy trong kênh hiện tại |
| `/reactbill bill` | Mọi người | Tạo hệ thống ghép bill liên kênh (đăng ký vào kênh chung, quản lý tại đây) |

---

## ⭐ 23. Starboard (Bảng vàng danh dự)

Tự động đăng tin nhắn được nhiều người react lên kênh Starboard.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/starboard setup <channel> [threshold] [emoji]` | Manage Guild | Thiết lập kênh Starboard, ngưỡng số react cần thiết, emoji kích hoạt (mặc định sao) |
| `/starboard ignore <channel>` | Manage Guild | Bỏ qua tin nhắn từ kênh cụ thể (không cho lên Starboard) |
| `/starboard info` | Manage Guild | Xem cấu hình Starboard hiện tại |

---

## 💡 24. Suggestions (Góp ý)

Kênh tiếp nhận ý kiến thành viên với hệ thống phê duyệt/từ chối của Admin.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/suggest add <content> [anonymous]` | Mọi người | Gửi ý kiến lên kênh góp ý. Hỗ trợ ẩn danh |
| `/suggest setup <channel>` | Manage Guild | Đặt kênh nhận góp ý |
| `/suggest approve <message_id> [comment]` | Manage Guild | Phê duyệt góp ý, có thể kèm bình luận |
| `/suggest reject <message_id> [comment]` | Manage Guild | Từ chối góp ý |
| `/suggest consider <message_id> [comment]` | Manage Guild | Đánh dấu góp ý đang được xem xét |

---

## 🔊 25. Temporary Voice (Kênh thoại tạm thời)

Tự động tạo kênh voice riêng tư khi vào Hub và xóa khi không còn ai. Chủ kênh có toàn quyền quản lý.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/vc setup <hub_channel>` | Manage Guild | Đặt kênh Hub. Ai vào đây sẽ được auto chuyển vào kênh riêng mới |
| `/vc rename <name>` | Chủ kênh | Đổi tên kênh thoại của bạn |
| `/vc limit <limit>` | Chủ kênh | Giới hạn số người (0 = không giới hạn, tối đa 99) |
| `/vc lock` | Chủ kênh | Khóa kênh, không cho người lạ tham gia |
| `/vc unlock` | Chủ kênh | Mở khóa kênh |
| `/vc hide` | Chủ kênh | Ẩn kênh khỏi danh sách |
| `/vc show` | Chủ kênh | Hiện lại kênh |
| `/vc kick <user>` | Chủ kênh | Đuổi thành viên ra khỏi kênh của bạn |
| `/vc transfer <user>` | Chủ kênh | Nhượng quyền chủ kênh cho người khác |
| `/vc info` | Mọi người | Xem thông tin kênh thoại hiện tại |

---

## 🎫 26. Ticket System (Hỗ trợ)

Phòng hỗ trợ riêng tư với transcript tự động và hệ thống ưu tiên.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/ticket panel <channel> <title> <description> [button_label] [category_id]` | Manage Guild | Tạo bảng nhấn nút mở ticket trong kênh chỉ định. Ticket tạo ra sẽ nằm trong category cụ thể |
| `/ticket close [reason]` | Trong ticket | Đóng ticket và tự động xuất transcript toàn bộ lịch sử chat |
| `/ticket claim` | Manage Messages | Nhận xử lý ticket, chỉ người nhận và chủ ticket mới xem được |
| `/ticket transfer <user>` | Manage Messages | Chuyển ticket cho admin/staff khác xử lý |
| `/ticket priority <level>` | Manage Messages | Đặt độ ưu tiên: LOW / NORMAL / HIGH / URGENT |
| `/ticket transcript` | Trong ticket | Xuất transcript thủ công ra file .txt |

---

## 🛠️ 27. Utility (Tiện ích)

Các công cụ hỗ trợ thông tin và thông báo nhanh.

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/util avatar [user]` | Mọi người | Xem ảnh đại diện full size |
| `/util userinfo [user]` | Mọi người | Thông tin chi tiết: ngày tạo TK, ngày join server, roles, hoạt động tin nhắn và voice 1/7/30 ngày |
| `/util serverinfo` | Mọi người | Thông tin chi tiết server: owner, boost, số kênh, số role, ngày tạo |
| `/util roleinfo <role>` | Mọi người | Thông tin role: màu, quyền, số thành viên đang có |
| `/util remind <time> <message>` | Mọi người | Đặt hẹn giờ nhắc nhở (vd: 10m, 2h, 1d) |
| `/util color <hex>` | Mọi người | Xem trước màu HEX |
| `/util calc <expression>` | Mọi người | Máy tính biểu thức toán học |
| `/help [module]` | Mọi người | Menu hướng dẫn lệnh theo module |
| `/announce send <title> <message> [channel] [color] [mention]` | Manage Guild | Gửi thông báo Embed vào kênh, hỗ trợ ping role kèm theo |
| `/announce dm <message>` | Manage Guild | Gửi DM tới toàn bộ thành viên trong server |
| `/announce schedule <message> <time> [channel]` | Manage Guild | Hẹn giờ gửi thông báo tự động (vd: 2h, 1d) |

---

## ✅ 28. Member Verification (Xác minh thành viên)

Chống tài khoản ảo với hệ thống xác minh BUTTON (nhấn nút) hoặc MATH (giải toán Captcha).

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/verify setup <channel> <verified_role> [type]` | Manage Guild | Cài kênh xác minh, role được cấp sau xác minh và phương thức (BUTTON hoặc MATH) |
| `/verify panel <channel> <title> <description>` | Manage Guild | Gửi bảng nhấn nút xác minh vào kênh |
| `/verify autokick <enabled> <minutes>` | Manage Guild | Tự động kick thành viên chưa xác minh sau X phút |
| `/verify info` | Manage Guild | Xem cấu hình xác minh hiện tại |

---

## 👋 29. Welcome & Leave (Chào mừng & Tiễn biệt)

Gửi tin nhắn tùy chỉnh khi thành viên vào/rời. Hỗ trợ placeholder động và auto-role.

Placeholder hỗ trợ: {user} (tag), {username}, {server}, {count} (số thành viên).

| Lệnh | Quyền | Mô tả |
|------|-------|-------|
| `/welcome setup <channel> <message> [auto_role]` | Manage Guild | Cài kênh chào mừng, nội dung tin nhắn và role tự động cấp khi vào server |
| `/welcome leave <channel> <message>` | Manage Guild | Cài kênh và nội dung tin nhắn tiễn biệt |
| `/welcome dm <enabled> <message>` | Manage Guild | Bật/Tắt DM chào mừng gửi đến thành viên mới |
| `/welcome test` | Manage Guild | Gửi tin nhắn chào mừng thử nghiệm (không thật) |
| `/welcome disable` | Manage Guild | Tắt toàn bộ hệ thống chào mừng/tiễn biệt |

---

## 👑 30. Owner Management (Lệnh chủ sở hữu bot)

Chỉ dành cho lập trình viên/owner bot. Được bảo vệ bằng kiểm tra BOT_OWNER_IDS trong .env.

| Lệnh | Mô tả |
|------|-------|
| `/owner eval <code>` | Chạy code JavaScript/TypeScript trực tiếp từ Discord |
| `/owner reload <module>` | Hot-reload một module mà không cần khởi động lại bot |
| `/owner stats` | Xem thống kê hệ thống: Guilds, Users, Modules, Commands, Uptime, RAM, Node.js version |
| `/owner broadcast <message>` | Gửi thông báo đến toàn bộ server đang chứa bot |
| `/owner maintenance <enabled>` | Bật/Tắt chế độ bảo trì (khi bật: chỉ owner mới dùng được bot) |

> **Lưu ý:** Lệnh /owner shell trong guide cũ không tồn tại trong source code — đã loại bỏ.

---

## 📊 Tổng quan

| Thống kê | Số lượng |
|----------|----------|
| Tổng số module | 29 |
| Tổng số lệnh slash (top-level) | 44 |
| Tổng số subcommand | 120+ |
| Module tự động (không có slash) | 2 (Scam Detection, Dashboard) |

---

*Tài liệu này được tổng hợp trực tiếp từ source code — chính xác với từng tham số, quyền hạn và chức năng đang được triển khai. Cập nhật: 2026-07-17.*
