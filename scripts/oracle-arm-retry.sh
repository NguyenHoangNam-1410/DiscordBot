#!/usr/bin/env bash
# Tự thử tạo VM Oracle Cloud ARM (Ampere A1, Always Free) cho đến khi hết "Out of host capacity".
# Chạy được trong Oracle Cloud Shell (đã có sẵn `oci`) hoặc máy có OCI CLI đã `oci setup config`.
#
# Dùng:
#   cp scripts/oracle-arm-retry.env.example ~/oracle-arm.env   # rồi điền giá trị
#   set -a; . ~/oracle-arm.env; set +a
#   nohup bash scripts/oracle-arm-retry.sh > ~/oracle-arm.log 2>&1 &
#
# Biến bắt buộc: COMPARTMENT_OCID SUBNET_OCID IMAGE_OCID SSH_PUBLIC_KEY_FILE
# Biến tùy chọn: AVAILABILITY_DOMAINS (cách nhau dấu phẩy, mặc định: tự lấy hết AD của tenancy)
#                OCPUS (4) MEMORY_GB (24) BOOT_VOLUME_GB (50) DISPLAY_NAME (discord-bot-arm)
#                SLEEP_SECONDS (60) RATE_LIMIT_SLEEP_SECONDS (300) MAX_ATTEMPTS (0 = không giới hạn)
set -u

: "${COMPARTMENT_OCID:?thiếu COMPARTMENT_OCID}"
: "${SUBNET_OCID:?thiếu SUBNET_OCID}"
: "${IMAGE_OCID:?thiếu IMAGE_OCID (ảnh aarch64, ví dụ Ubuntu 22.04/24.04 ARM)}"
: "${SSH_PUBLIC_KEY_FILE:?thiếu SSH_PUBLIC_KEY_FILE (đường dẫn file .pub)}"

OCPUS="${OCPUS:-4}"
MEMORY_GB="${MEMORY_GB:-24}"
BOOT_VOLUME_GB="${BOOT_VOLUME_GB:-50}"
DISPLAY_NAME="${DISPLAY_NAME:-discord-bot-arm}"
SLEEP_SECONDS="${SLEEP_SECONDS:-60}"
RATE_LIMIT_SLEEP_SECONDS="${RATE_LIMIT_SLEEP_SECONDS:-300}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-0}"
SHAPE="VM.Standard.A1.Flex"

command -v oci >/dev/null 2>&1 || { echo "Không thấy lệnh 'oci'. Dùng Oracle Cloud Shell hoặc cài OCI CLI." >&2; exit 2; }
[ -r "$SSH_PUBLIC_KEY_FILE" ] || { echo "Không đọc được $SSH_PUBLIC_KEY_FILE" >&2; exit 2; }

log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

if [ -n "${AVAILABILITY_DOMAINS:-}" ]; then
  IFS=',' read -r -a ADS <<< "$AVAILABILITY_DOMAINS"
else
  mapfile -t ADS < <(oci iam availability-domain list --compartment-id "$COMPARTMENT_OCID" \
    --query 'data[].name' 2>/dev/null | grep -o '"[^"]*"' | tr -d '"' || true)
fi
[ "${#ADS[@]}" -gt 0 ] || { echo "Không lấy được availability domain. Đặt AVAILABILITY_DOMAINS thủ công." >&2; exit 2; }

SHAPE_CONFIG="{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}"
log "Bắt đầu: $SHAPE ${OCPUS} OCPU / ${MEMORY_GB} GB, AD: ${ADS[*]}"

attempt=0
while :; do
  for ad in "${ADS[@]}"; do
    attempt=$((attempt + 1))
    if [ "$MAX_ATTEMPTS" -gt 0 ] && [ "$attempt" -gt "$MAX_ATTEMPTS" ]; then
      log "Đã thử $MAX_ATTEMPTS lần, dừng."
      exit 1
    fi
    log "Lần $attempt · AD $ad"
    out="$(oci compute instance launch \
      --availability-domain "$ad" \
      --compartment-id "$COMPARTMENT_OCID" \
      --shape "$SHAPE" \
      --shape-config "$SHAPE_CONFIG" \
      --subnet-id "$SUBNET_OCID" \
      --image-id "$IMAGE_OCID" \
      --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
      --display-name "$DISPLAY_NAME" \
      --assign-public-ip true \
      --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" 2>&1)"
    status=$?

    if [ "$status" -eq 0 ] && printf '%s' "$out" | grep -q '"lifecycle-state"'; then
      log "TẠO THÀNH CÔNG:"
      printf '%s\n' "$out"
      exit 0
    fi

    if printf '%s' "$out" | grep -qiE 'out of (host )?capacity|OutOfHostCapacity'; then
      log "Hết capacity, thử lại."
    elif printf '%s' "$out" | grep -qiE 'TooManyRequests|"status": 429'; then
      log "Bị giới hạn tốc độ (429), nghỉ ${RATE_LIMIT_SLEEP_SECONDS}s."
      sleep "$RATE_LIMIT_SLEEP_SECONDS"
    elif printf '%s' "$out" | grep -qiE 'InternalError|"status": 5[0-9][0-9]|ServiceUnavailable|timed? ?out|Connection'; then
      log "Lỗi tạm thời phía Oracle/mạng, thử lại."
    else
      log "Lỗi không thể thử lại, dừng (kiểm tra OCID, quyền, hạn mức):"
      printf '%s\n' "$out"
      exit 1
    fi
    sleep "$SLEEP_SECONDS"
  done
done
