"use strict";

const fs = require("node:fs");
const path = require("node:path");
const defaultSite = require("./publicSite.json");

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function createPublicPages(games, site = defaultSite) {
  const support = new URL(site.supportUrl);
  if (support.protocol !== "https:" || support.username || support.password)
    throw new Error("Public support URL must use HTTPS without credentials");
  if (!/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(site.supportEmail))
    throw new Error("Public support email is invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(site.updatedAt))
    throw new Error("Public policy update date must use YYYY-MM-DD");
  const name = escape(site.appName);
  const updated = site.updatedAt.split("-").reverse().join("/");
  const contact = `
    <section id="contact" class="contact-card" aria-labelledby="contact-title">
      <p class="eyebrow">HỖ TRỢ &amp; DỮ LIỆU CÁ NHÂN</p>
      <h2 id="contact-title">Liên hệ người vận hành</h2>
      <p>Bạn có thể gửi câu hỏi về dịch vụ hoặc yêu cầu liên quan đến dữ liệu qua một trong hai kênh:</p>
      <div class="contact-links"><a class="button-link" href="${escape(support.href)}" target="_blank" rel="noopener noreferrer">Server Discord hỗ trợ ↗</a><a class="email-link" href="mailto:${escape(site.supportEmail)}">${escape(site.supportEmail)}</a></div>
      <p class="small">Khi yêu cầu xem, sửa hoặc xóa dữ liệu, hãy cung cấp Discord User ID, server liên quan và phạm vi yêu cầu. Người vận hành có thể yêu cầu bạn xác nhận quyền sở hữu tài khoản trong Discord. Không gửi mật khẩu, token hoặc thông tin thanh toán.</p>
    </section>`;
  function page(title, description, content, active, portal = false) {
    const nav = [
      ["/", "Trò chơi"],
      ["/terms", "Điều khoản"],
      ["/privacy", "Riêng tư"],
    ]
      .map(
        ([href, label]) =>
          `<a href="${href}"${active === href ? ' aria-current="page"' : ""}>${label}</a>`,
      )
      .join("");
    return Buffer.from(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101a23"><meta name="description" content="${escape(description)}"><title>${escape(title)} · ${name}</title><link rel="stylesheet" href="/site.css">${portal ? '<script src="/portal.js" defer></script>' : ""}</head>
<body><a class="skip-link" href="#main">Đến nội dung chính</a><div class="shell"><header class="site-header"><a class="brand" href="/">${name}</a><nav aria-label="Điều hướng chính">${nav}<a href="#contact">Liên hệ</a></nav></header>
<main id="main"><div class="page-heading"><p class="eyebrow">${portal ? "KHÔNG GIAN TRÒ CHƠI" : "THÔNG TIN DỊCH VỤ"}</p><h1>${escape(title)}</h1><p class="lede">${escape(description)}</p>${portal ? "" : `<p class="updated">Cập nhật ngày <time datetime="${site.updatedAt}">${updated}</time></p>`}</div>${content}${contact}</main>
<footer><span>${name}</span><nav aria-label="Thông tin dịch vụ"><a href="/terms">Điều khoản sử dụng</a><a href="/privacy">Chính sách riêng tư</a><a href="#contact">Liên hệ hỗ trợ</a></nav></footer></div></body></html>`);
  }

  const terms = `
    <article class="policy" aria-label="Nội dung điều khoản">
      <section><h2>1. Phạm vi dịch vụ</h2><p>${name} cung cấp trò chơi, hồ sơ, thành tựu, bảng xếp hạng và các tiện ích trên Discord; một số trò chơi có bàn chơi trên web. Chủ ứng dụng Discord và những người được chủ ứng dụng ủy quyền là bên vận hành dịch vụ. Bot hoạt động độc lập, không phải sản phẩm do Discord, Google hoặc các nhà cung cấp AI vận hành.</p><p>Khi sử dụng bot hoặc bàn chơi web, bạn cần tuân thủ các điều khoản này, quy định của server và <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer">Điều khoản Discord</a>. Chỉ sử dụng dịch vụ khi đáp ứng điều kiện độ tuổi và sử dụng Discord áp dụng cho bạn.</p></section>
      <section><h2>2. Xu, kim cương và vật phẩm trong game</h2><p>Xu, kim cương, vé và vật phẩm là tài nguyên ảo phục vụ giải trí trong bot. Chúng không phải tiền thật, không có giá trị quy đổi hoặc rút ra tiền và không đại diện cho tài sản ngoài trò chơi. Bot hiện không cung cấp cổng nạp hoặc rút tiền thật.</p><p>Không dùng bot để tổ chức giao dịch tiền thật, đổi thưởng ngoài hệ thống hoặc lừa người khác chuyển tiền. Luật, mức thưởng, vật phẩm và độ khó có thể được điều chỉnh; lịch sử thay đổi dành cho người chơi có trong lệnh <code>/changelog</code>.</p></section>
      <section><h2>3. Tài khoản và hành vi chơi</h2><p>Bạn chịu trách nhiệm về các thao tác thực hiện qua tài khoản Discord của mình. Không giả mạo người khác, khai thác lỗi, dùng tự động hóa để gian lận, gửi spam hoặc can thiệp vào ván đấu và dữ liệu của người khác. Khi phát hiện lỗi, hãy báo qua kênh hỗ trợ.</p><p>Giữ riêng mã xác nhận và đường dẫn vào bàn dành cho tài khoản của bạn. Không cung cấp mật khẩu hoặc token Discord cho người tự nhận là hỗ trợ bot.</p></section>
      <section><h2>4. Luật ván đấu và quyền quản trị</h2><p>Mỗi trò chơi có luật, giới hạn thời gian và điều kiện kết thúc riêng, được mô tả trong giao diện hoặc lệnh hướng dẫn. Mất kết nối, hết thời gian hoặc bỏ ván có thể làm bạn thua hay mất phần thưởng theo luật của trò chơi.</p><p>Quản trị viên có thể cấu hình hoặc bảo trì game trong server. Người vận hành có thể hạn chế hành vi vi phạm, kết thúc ván bị lỗi và sửa dữ liệu sai hoặc phát sinh từ gian lận. Khi cần giải thích hay xem xét lại một xử lý, hãy liên hệ hỗ trợ.</p></section>
      <section><h2>5. Chatbot và nội dung do AI tạo</h2><p>Khi dùng chatbot, nội dung câu hỏi và ngữ cảnh cần thiết được gửi đến dịch vụ AI đang được cấu hình. Câu trả lời có thể không chính xác; bạn cần kiểm tra trước khi dựa vào thông tin đó để đưa ra quyết định. Không gửi bí mật, thông tin nhạy cảm hoặc dữ liệu của người khác khi chưa có quyền phù hợp.</p></section>
      <section><h2>6. Tính sẵn có và thay đổi dịch vụ</h2><p>Dịch vụ có thể tạm ngừng do bảo trì, lỗi máy chủ, kết nối mạng hoặc nền tảng bên ngoài. Bot không cam kết hoạt động liên tục hoặc giữ nguyên mọi thông số game. Những thay đổi ảnh hưởng đến người chơi được thông tin qua bot, trang này hoặc kênh hỗ trợ.</p></section>
      <section><h2>7. Dữ liệu và yêu cầu hỗ trợ</h2><p>Việc xử lý dữ liệu được mô tả tại <a href="/privacy">Chính sách riêng tư</a>. Bạn có thể liên hệ bên dưới để đặt câu hỏi, báo lỗi hoặc yêu cầu xem, sửa hay xóa dữ liệu. Yêu cầu được xác minh và xử lý bởi người vận hành.</p></section>
    </article>`;

  const privacy = `
    <article class="policy" aria-label="Nội dung chính sách riêng tư">
      <section><h2>1. Dữ liệu được xử lý</h2><p>Để cung cấp tính năng bạn sử dụng, bot xử lý các nhóm thông tin sau:</p><ul><li><strong>Thông tin Discord:</strong> ID người dùng, server, kênh, tin nhắn liên quan đến chức năng; tên hiển thị và ảnh đại diện khi cần hiển thị hồ sơ hoặc bàn chơi.</li><li><strong>Dữ liệu trò chơi:</strong> lựa chọn, trạng thái và kết quả ván; số dư tài nguyên ảo, giao dịch trong game, túi đồ, gacha, nhiệm vụ, thành tựu, hồ sơ và bảng xếp hạng.</li><li><strong>Nội dung tương tác:</strong> lệnh, câu trả lời trò chơi, câu hỏi gửi chatbot và thông tin hoặc phong cách chatbot do quản trị server cấu hình.</li><li><strong>Dữ liệu vận hành:</strong> thời điểm thao tác, lỗi, thống kê sử dụng dịch vụ AI như model, token và chi phí; thông tin kết nối cần cho việc truyền tải và giới hạn yêu cầu.</li></ul><p>Bot xử lý tin nhắn trong phạm vi quyền được cấp để nhận lệnh, câu trả lời game và các tương tác được hỗ trợ. Việc xử lý này không có nghĩa bot lưu toàn bộ lịch sử tin nhắn của server. Bot không yêu cầu mật khẩu Discord hoặc thông tin thẻ thanh toán.</p></section>
      <section><h2>2. Mục đích sử dụng</h2><p>Dữ liệu được dùng để nhận diện người chơi, kiểm tra quyền, vận hành và tiếp tục ván, tính thưởng, hiển thị hồ sơ và kết quả, trả lời chatbot, giới hạn lạm dụng, xử lý sự cố và hỗ trợ người dùng. Trang web không tích hợp công cụ quảng cáo hoặc phân tích hành vi của bên thứ ba.</p></section>
      <section><h2>3. Thông tin được hiển thị cho người khác</h2><p>Hồ sơ, thành tích, bảng xếp hạng, kết quả và tin phòng có thể được nhìn thấy bởi người có quyền xem kênh Discord tương ứng hoặc người có đường dẫn công khai tới bàn chơi web. Tên người chơi và diễn biến công khai trên bàn được cung cấp cho khán giả.</p><p>Dữ liệu riêng của trò chơi được phân quyền theo chức năng. Ví dụ, vị trí thuyền chưa bị bắn của một người chơi Battleship không được gửi cho đối thủ hoặc khán giả. Bạn không nên chia sẻ mã xác nhận hoặc đường dẫn đăng nhập riêng.</p></section>
      <section><h2>4. Discord, AI và hạ tầng bên ngoài</h2><ul><li><strong>Discord:</strong> tiếp nhận lệnh, tương tác và tin nhắn phản hồi. Ảnh đại diện trên bàn chơi web được tải từ máy chủ ảnh Discord; trình duyệt gửi yêu cầu tải ảnh trực tiếp tới Discord. Nếu cấu hình gửi sao lưu qua Discord được bật, bản sao dữ liệu được gửi riêng cho tài khoản phụ trách do chủ bot chỉ định.</li><li><strong>Nhà cung cấp AI:</strong> khi bạn dùng chatbot, câu hỏi, một phần hội thoại gần đây, thông tin server do quản trị cung cấp và tên/ID của người hỏi hoặc người được nhắc có thể được gửi để tạo câu trả lời. Nhà cung cấp tùy cấu hình, có thể là Google Gemini, OpenAI, OpenRouter hoặc một dịch vụ tương thích khác. Nếu bật tìm kiếm, nội dung truy vấn cũng có thể được xử lý qua dịch vụ tìm kiếm của nhà cung cấp.</li><li><strong>Hạ tầng máy chủ và Tailscale Funnel:</strong> chuyển tiếp kết nối web và xử lý thông tin mạng cần thiết để cung cấp trang và bàn chơi.</li></ul><p>Những dịch vụ này có chính sách xử lý dữ liệu riêng. Không gửi thông tin nhạy cảm cho chatbot. Người vận hành sử dụng dữ liệu cho các mục đích nêu trong chính sách này, không bán dữ liệu người chơi để quảng cáo.</p></section>
      <section><h2>5. Cookie và bộ nhớ trình duyệt</h2><p>Bàn chơi web dùng cookie phiên để gắn quyền chơi với tài khoản đã xác nhận trong Discord. Phiên có thời hạn tối đa 12 giờ; cookie được đặt HttpOnly và sử dụng kết nối bảo mật khi truy cập HTTPS. Liên kết hoặc mã kết nối có thời hạn 5 phút.</p><p>Bộ nhớ theo tab lưu thông tin xác nhận tạm để tiếp tục khi tải lại trang. Thông tin được bỏ khi hoàn tất, thay mã, nhận biết đã hết hạn hoặc đóng tab. Các trang Điều khoản và Riêng tư có thể đọc công khai và không yêu cầu đăng nhập hay tạo cookie phiên.</p></section>
      <section><h2>6. Lưu giữ và sao lưu</h2><p>Dữ liệu trò chơi, hồ sơ, giao dịch và thống kê có thể được giữ để duy trì tiến trình, lịch sử, xử lý lỗi và chống gian lận. Kết thúc ván hoặc gỡ bot khỏi server không tự động xóa toàn bộ dữ liệu đã lưu. Hiện không có một thời hạn xóa tự động chung cho mọi loại dữ liệu.</p><p>Ngữ cảnh hội thoại chatbot dùng để tiếp nối hội thoại được giữ tạm trong bộ nhớ tiến trình; ngữ cảnh quá 30 phút không được dùng tiếp. Thông tin thống kê sử dụng AI được lưu riêng. Tin nhắn đã gửi trên Discord và dữ liệu do nhà cung cấp AI xử lý có quy tắc lưu giữ riêng.</p><p>Người vận hành có thể lưu bản sao dữ liệu để khôi phục khi xảy ra sự cố. Các bản sao có chu kỳ lưu giữ riêng theo cấu hình, nên dữ liệu trong sao lưu có thể còn sau khi bản đang sử dụng đã được sửa hoặc xóa. Khi tiếp nhận yêu cầu xóa, người vận hành cần kiểm tra cả dữ liệu đang sử dụng và các bản sao liên quan, đồng thời thông báo phạm vi xử lý.</p></section>
      <section><h2>7. Yêu cầu xem, sửa hoặc xóa dữ liệu</h2><p>Gửi yêu cầu qua server hỗ trợ hoặc email ở cuối trang, kèm Discord User ID, server liên quan và nội dung bạn muốn xem, sửa hoặc xóa. Yêu cầu có thể gửi qua tin nhắn hoặc email; không đăng dữ liệu nhạy cảm trong kênh công khai.</p><p>Người vận hành có thể xác minh quyền sở hữu tài khoản trước khi cung cấp hoặc thay đổi dữ liệu. Việc xử lý là thủ công, không có lệnh tự động xóa mọi dữ liệu cá nhân. Bạn sẽ được thông tin về phạm vi và tiến độ xử lý, bao gồm sao lưu hoặc dữ liệu do nền tảng bên ngoài quản lý nếu có liên quan.</p></section>
      <section><h2>8. Cập nhật chính sách</h2><p>Khi cách xử lý dữ liệu thay đổi, chính sách này sẽ được cập nhật cùng ngày sửa đổi. Bạn có thể dùng thông tin liên hệ bên dưới để hỏi về bất kỳ nội dung nào trong chính sách.</p></section>
    </article>`;

  const gameCards = games
    .map(
      (game) =>
        `<li><a href="/${escape(game.id)}/"><h2>${escape(game.name)}</h2><p>Mở phòng trong Discord để chơi hoặc theo dõi trực tiếp.</p><span>Mở trang trò chơi →</span></a></li>`,
    )
    .join("");
  const portal = `<section aria-labelledby="games-title"><h2 id="games-title" class="section-title">Chọn trò chơi</h2><ul class="game-grid">${gameCards}</ul></section><section class="intro-card"><h2>Chơi trên Discord, tiếp tục trên web</h2><p>Tạo phòng bằng lệnh của bot trong server Discord rồi mở bàn từ tin mời. Người chơi xác nhận tài khoản bằng mã; khán giả có thể xem diễn biến công khai.</p><p>Trước khi sử dụng, bạn có thể đọc <a href="/terms">Điều khoản sử dụng</a> và <a href="/privacy">Chính sách riêng tư</a>.</p></section>`;
  return new Map([
    [
      "/",
      {
        type: "text/html; charset=utf-8",
        data: page(
          "Trò chơi Discord",
          "Mở phòng từ lệnh của bot trong Discord, hoặc chọn trò chơi để xem hướng dẫn.",
          portal,
          "/",
          true,
        ),
      },
    ],
    [
      "/terms",
      {
        type: "text/html; charset=utf-8",
        data: page(
          "Điều khoản sử dụng",
          "Các quy tắc áp dụng khi sử dụng bot và các bàn chơi web.",
          terms,
          "/terms",
        ),
      },
    ],
    [
      "/privacy",
      {
        type: "text/html; charset=utf-8",
        data: page(
          "Chính sách riêng tư",
          "Dữ liệu được xử lý, cách sử dụng và cách liên hệ để thực hiện yêu cầu về dữ liệu.",
          privacy,
          "/privacy",
        ),
      },
    ],
    [
      "/site.css",
      {
        type: "text/css; charset=utf-8",
        data: fs.readFileSync(path.join(__dirname, "public/site.css")),
      },
    ],
  ]);
}

module.exports = { createPublicPages };
