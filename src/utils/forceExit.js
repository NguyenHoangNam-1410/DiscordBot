"use strict";
// Sau khi bot đã dọn dẹp xong (backup, Discord, database) mà tiến trình vẫn chưa thoát, nghĩa là còn handle nào đó giữ vòng lặp sự kiện.
// PM2 khi đó phải đợi hết kill_timeout mới ép tắt, nên thoát cứng sau vài giây và ghi lại tài nguyên còn sót để dễ tìm nguyên nhân.
function scheduleForcedExit(
  logger,
  exitCode = 0,
  {
    delayMs = 3000,
    exit = (code) => process.exit(code),
    resources = () => process.getActiveResourcesInfo?.(),
  } = {},
) {
  // Không unref: bộ hẹn giờ này chính là thứ đảm bảo tiến trình kết thúc.
  return setTimeout(() => {
    logger.warn?.(
      { resources: resources() },
      "event loop still active after shutdown; forcing exit",
    );
    logger.flush?.();
    exit(process.exitCode ?? exitCode);
  }, delayMs);
}

module.exports = { scheduleForcedExit };
