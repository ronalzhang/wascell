#!/usr/bin/env python3
"""Isolate the audited Nov 4 application burst. Stdlib only, Python 3.8+.

Dry-run is read-only. For apply or rollback, stop the website writer and run
as the current ledger owner. Keep the writer stopped through verification.
The quarantine directory must have an existing private parent on the uploads
filesystem. On interruption run --rollback with the same paths and approved
archive ledger SHA256 before allowing new writes. Keep the private backup.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import tempfile


LEDGER_REL = Path("advisor-data/applications.json")
UPLOADS_REL = Path("advisor-uploads")
BACKUP_REL = Path("backup") / LEDGER_REL
MANIFEST_REL = Path("manifest.json")
START = datetime.fromisoformat("2026-11-04T00:03:38+08:00")
END = datetime.fromisoformat("2026-11-04T01:15:26+08:00")
EXPECTED_ROWS = 89
EXPECTED_ATTACHMENTS = 88
EXPECTED_OLD = 2
MAX_LEDGER_BYTES = 32 * 1024 * 1024
ORDER_ID = re.compile(r"ARK-20261103-[0-9A-F]{6}")
STORAGE_NAME = re.compile(r"[0-9a-f]{24}\.(pdf|jpg|png)")
DIGEST = re.compile(r"[0-9a-f]{64}")
KNOWN_REFERENCES = (
    Path("service-case-data/service-cases.json"),
    Path("business-data/partner-program/partner-program.json"),
)


class QuarantineError(Exception):
    pass


class QuietParser(argparse.ArgumentParser):
    def error(self, _message):
        raise QuarantineError("参数无效。请查看 --help。")


def check(condition, message):
    if not condition:
        raise QuarantineError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def check_digest(expected, actual, label):
    check(isinstance(expected, str) and DIGEST.fullmatch(expected.lower()),
          "须输入 64 位十六进制 SHA256。")
    check(isinstance(actual, str) and hmac.compare_digest(expected.lower(), actual), label + " SHA256 不匹配。")


def parse_args(argv):
    parser = QuietParser(description="核验并隔离 2026-11-04 北京时间已审计的异常申请。默认只核验。")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="确认网站停止写入后执行隔离")
    mode.add_argument("--rollback", action="store_true", help="确认网站停止写入后恢复此隔离")
    parser.add_argument("--ledger", required=True, type=Path, help="当前 advisor-data/applications.json")
    parser.add_argument("--uploads", required=True, type=Path, help="当前 advisor-uploads")
    parser.add_argument("--quarantine-dir", required=True, type=Path, help="已存在私有父目录下的新隔离目录")
    parser.add_argument("--archive", type=Path, help="上线前 applications.json 文件或包含它的 tar 归档")
    parser.add_argument("--archive-member", help="tar 内指定成员路径。缺省自动查找唯一账本")
    parser.add_argument("--expected-sha256", help="经过核验的归档 applications.json 原始字节 SHA256")
    parser.add_argument("--expected-live-sha256", help="可选的生产账本原始字节 SHA256")
    parser.add_argument("--expected-candidates-sha256", help="可选的已核验候选集合 SHA256")
    parser.add_argument("--reference-ledger", action="append", type=Path, default=[],
                        help="另有客户引用的 JSON 台账，可多次提供")
    args = parser.parse_args(argv)
    check(args.rollback or args.archive is not None, "核验和隔离需要上线前归档。")
    check(not (args.apply or args.rollback) or args.expected_sha256,
          "隔离和回滚须提供完整的归档账本 SHA256。")
    return args


def normalize(path):
    return path.parent.resolve(strict=True) / path.name


def path_present(path):
    return os.path.lexists(path)


def directory(path):
    info = path.lstat()
    check(stat.S_ISDIR(info.st_mode), "指定目录或候选附件目录类型不符。")
    return info


def inside(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_paths(args):
    args.ledger = normalize(args.ledger)
    args.uploads = normalize(args.uploads)
    args.quarantine_dir = normalize(args.quarantine_dir)
    check(args.ledger.name == LEDGER_REL.name and args.ledger.parent.name == LEDGER_REL.parent.name
          and args.uploads.name == UPLOADS_REL.name, "运行账本或附件目录名称不符。")
    directory(args.ledger.parent)
    upload_info = directory(args.uploads)
    parent = directory(args.quarantine_dir.parent)
    check(not (parent.st_mode & 0o077), "隔离目录的父目录须为私有目录。")
    check(parent.st_dev == upload_info.st_dev, "隔离目录须与原附件同一文件系统。")
    for live in (args.ledger.parent, args.uploads):
        check(not inside(args.quarantine_dir, live) and not inside(live, args.quarantine_dir),
              "隔离路径不得和应用数据目录重叠。")
    if args.archive is not None:
        args.archive = normalize(args.archive)
        check(args.archive != args.ledger, "归档须独立于当前账本。")


def open_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        check(stat.S_ISREG(os.fstat(fd).st_mode), "账本、归档或清单必须是普通文件。")
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def bounded_read(stream):
    data = stream.read(MAX_LEDGER_BYTES + 1)
    check(len(data) <= MAX_LEDGER_BYTES, "账本超过可核验大小。")
    return data


def read_file(path):
    with open_regular(path) as stream:
        return bounded_read(stream)


def archive_ledger(path, explicit_member):
    with open_regular(path) as stream:
        if path.suffix.lower() == ".json" and explicit_member is None:
            return bounded_read(stream)
        with tarfile.open(fileobj=stream, mode="r:*") as bundle:
            target = None
            for member in bundle:
                name = PurePosixPath(member.name)
                if explicit_member is not None:
                    matches = name == PurePosixPath(explicit_member)
                else:
                    matches = name.parts[-2:] == LEDGER_REL.parts
                if matches:
                    check(target is None and member.isfile() and not member.issparse()
                          and 0 <= member.size <= MAX_LEDGER_BYTES and ".." not in name.parts,
                          "归档账本重复、大小超限或类型不符。")
                    target = member
            check(target is not None, "归档内未找到应用账本。")
            with bundle.extractfile(target) as ledger:
                return bounded_read(ledger)


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, "账本含重复 JSON 字段。")
        result[key] = value
    return result


def invalid_constant(_value):
    raise QuarantineError("账本含无效 JSON 数值。")


def decode(data):
    return json.loads(data, object_pairs_hook=unique_pairs, parse_constant=invalid_constant)


def encode(value):
    return (json.dumps(value, ensure_ascii=True, allow_nan=False, indent=2) + "\n").encode()


def canonical(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()


def read_records(data):
    rows = decode(data)
    check(isinstance(rows, list), "应用账本须为 JSON 数组。")
    index = {}
    for row in rows:
        check(isinstance(row, dict), "应用记录格式不符。")
        identifier = row.get("id")
        check(isinstance(identifier, str) and identifier and identifier not in index, "应用记录 ID 缺失或重复。")
        index[identifier] = row
    return rows, index


def created(row):
    value = row.get("createdAt")
    check(isinstance(value, str), "归档记录创建时间格式不符。")
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise QuarantineError("归档记录创建时间格式不符。") from error
    check(stamp.tzinfo is not None, "归档记录缺少时间偏移。")
    return stamp


def candidate_attachments(rows):
    check(len(rows) == EXPECTED_ROWS, "候选申请数量与已审计集合不符。")
    uploads = {}
    for row in rows:
        identifier = row["id"]
        check(ORDER_ID.fullmatch(identifier), "候选记录 ID 不符合原始存储形式。")
        check(START <= created(row) < END and row.get("updatedAt") == row.get("createdAt")
              and row.get("status") == "new" and row.get("assignedSalesId") is None
              and row.get("membershipExpiresAt") is None
              and row.get("adminNote", "") == "" and row.get("salesNote", "") == ""
              and row.get("membershipEvents", []) == [] and row.get("internalBookings", []) == [],
              "至少一条候选申请存在业务处理痕迹或超出时间窗。")
        attachments = row.get("attachments")
        check(isinstance(attachments, list) and len(attachments) <= 3, "候选附件清单格式不符。")
        sizes = {}
        for attachment in attachments:
            check(isinstance(attachment, dict), "候选附件元数据格式不符。")
            name = attachment.get("storageName")
            size = attachment.get("size")
            check(isinstance(name, str) and STORAGE_NAME.fullmatch(name) and name not in sizes
                  and type(size) is int and 0 < size <= 10 * 1024 * 1024, "候选附件名称或大小格式不符。")
            sizes[name] = size
        uploads[identifier] = sizes
    check(sum(map(len, uploads.values())) == EXPECTED_ATTACHMENTS, "候选附件数量与已审计集合不符。")
    return uploads


def contains_reference(value, identifiers):
    if isinstance(value, list):
        return any(contains_reference(item, identifiers) for item in value)
    if isinstance(value, dict):
        return any(key in identifiers or contains_reference(item, identifiers) for key, item in value.items())
    return isinstance(value, str) and value in identifiers


def verify_references(args, identifiers):
    runtime = args.ledger.parent.parent
    for path in (runtime / name for name in KNOWN_REFERENCES):
        if path_present(path):
            check(not contains_reference(decode(read_file(path)), identifiers), "已知业务台账引用了候选申请。")
    for path in args.reference_ledger:
        check(not contains_reference(decode(read_file(normalize(path))), identifiers), "附加业务台账引用了候选申请。")


def verify_uploads(path, sizes):
    directory(path)
    check({entry.name for entry in path.iterdir()} == set(sizes), "候选附件目录内容与已审计记录不符。")
    for name, size in sizes.items():
        info = (path / name).lstat()
        check(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size == size,
              "候选附件类型、链接或大小与已审计记录不符。")


def verify_current_uploads(root, attachments):
    for identifier, sizes in attachments.items():
        path = root / identifier
        if sizes or path_present(path):
            verify_uploads(path, sizes)


def separate_rows(live, candidates):
    _, candidate_index = read_records(encode(candidates))
    live_rows, live_index = read_records(live)
    for identifier, candidate in candidate_index.items():
        check(identifier in live_index and canonical(candidate) == canonical(live_index[identifier]),
              "当前账本与归档的候选记录不一致。")
    retained = [row for row in live_rows if row["id"] not in candidate_index]
    after = encode(retained)
    check(canonical(decode(after)) == canonical(retained), "无法无损保留未选记录。")
    return after, len(retained), live_index


def build_plan(args):
    archived = archive_ledger(args.archive, args.archive_member)
    archive_hash = sha256(archived)
    if args.expected_sha256 is not None:
        check_digest(args.expected_sha256, archive_hash, "归档账本")
    archive_rows, _ = read_records(archived)
    older = [row for row in archive_rows if created(row) < START]
    candidates = [row for row in archive_rows if START <= created(row) < END]
    check(len(older) == EXPECTED_OLD and len(archive_rows) == EXPECTED_OLD + EXPECTED_ROWS,
          "归档行数或早期保留记录数量与核验结果不符。")
    attachments = candidate_attachments(candidates)

    before = read_file(args.ledger)
    after, retained_count, live_index = separate_rows(before, candidates)
    check(all(row["id"] in live_index and created(live_index[row["id"]]) == created(row) for row in older),
          "两条早期保留记录未能在现行账本核验。")
    verify_references(args, set(attachments))
    verify_current_uploads(args.uploads, attachments)
    manifest = {
        "incident": "arksoma-2026-11-04-applications",
        "archive_sha256": archive_hash,
        "before_sha256": sha256(before),
        "after_sha256": sha256(after),
        "candidates_sha256": sha256(canonical(candidates)),
        "candidate_count": EXPECTED_ROWS,
        "attachment_count": EXPECTED_ATTACHMENTS,
        "retained_count": retained_count,
    }
    if args.expected_live_sha256 is not None:
        check_digest(args.expected_live_sha256, manifest["before_sha256"], "当前账本")
    if args.expected_candidates_sha256 is not None:
        check_digest(args.expected_candidates_sha256, manifest["candidates_sha256"], "候选集合")
    return before, after, candidates, attachments, manifest


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextmanager
def ledger_write_lock(path):
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise QuarantineError("另一项账本隔离或恢复正在执行。") from error
        info = path.lstat()
        check(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid(),
              "须以账本文件所有者身份执行隔离或恢复。")
        yield
    finally:
        os.close(fd)


def private_file(path, data):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def replace_ledger(path, data):
    fd, name = tempfile.mkstemp(prefix=".applications.quarantine-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        sync_directory(path.parent)
    finally:
        if path_present(name):
            os.unlink(name)


def restore_layout(args, before, attachments, manifest):
    live_hash = sha256(read_file(args.ledger))
    check(live_hash in (manifest["before_sha256"], manifest["after_sha256"]),
          "当前账本出现其他写入，自动回滚已拒绝。")
    isolated_uploads = args.quarantine_dir / UPLOADS_REL
    directory(isolated_uploads)
    moves = []
    for identifier, sizes in attachments.items():
        if not sizes:
            continue
        source = isolated_uploads / identifier
        destination = args.uploads / identifier
        moved = path_present(source)
        check(moved != path_present(destination), "原位置和隔离位置的附件状态无法对账。")
        verify_uploads(source if moved else destination, sizes)
        if moved:
            moves.append((source, destination))
    for source, destination in moves:
        os.rename(source, destination)
    sync_directory(isolated_uploads)
    sync_directory(args.uploads)
    if live_hash == manifest["after_sha256"]:
        replace_ledger(args.ledger, before)
    check(sha256(read_file(args.ledger)) == manifest["before_sha256"], "回滚后的原账本校验失败。")


def apply_plan(args, plan):
    before, after, candidates, attachments, manifest = plan
    check(not path_present(args.quarantine_dir), "隔离目录已存在，请先核对既有隔离。")
    check(sha256(read_file(args.ledger)) == manifest["before_sha256"], "当前账本在核验后发生改变。")
    root = args.quarantine_dir
    root.mkdir(mode=0o700)
    for path in (UPLOADS_REL, LEDGER_REL.parent, Path("backup"), BACKUP_REL.parent):
        (root / path).mkdir(mode=0o700)
    private_file(root / BACKUP_REL, before)
    private_file(root / LEDGER_REL, encode(candidates))
    private_file(root / MANIFEST_REL, encode(manifest))
    for path in (root / BACKUP_REL.parent, root / "backup", root / LEDGER_REL.parent, root, root.parent):
        sync_directory(path)
    try:
        for identifier, sizes in attachments.items():
            if not sizes:
                continue
            source = args.uploads / identifier
            destination = root / UPLOADS_REL / identifier
            verify_uploads(source, sizes)
            check(not path_present(destination), "隔离目标已存在。")
            os.rename(source, destination)
        sync_directory(root / UPLOADS_REL)
        sync_directory(args.uploads)
        check(sha256(read_file(args.ledger)) == manifest["before_sha256"], "当前账本在隔离时发生改变。")
        replace_ledger(args.ledger, after)
        check(sha256(read_file(args.ledger)) == manifest["after_sha256"], "隔离后的账本校验失败。")
    except BaseException as error:
        try:
            restore_layout(args, before, attachments, manifest)
        except BaseException:
            raise QuarantineError("隔离中断，自动回滚未完成。保持网站停写，使用 --rollback 核验。") from error
        raise QuarantineError("隔离中断，已恢复原账本和已移动附件。") from error


def rollback(args):
    root = args.quarantine_dir
    check(not (directory(root).st_mode & 0o077), "隔离目录必须保持私有权限。")
    directory(root / "backup")
    directory((root / BACKUP_REL).parent)
    directory((root / LEDGER_REL).parent)
    manifest = decode(read_file(root / MANIFEST_REL))
    check(isinstance(manifest, dict) and manifest.get("incident") == "arksoma-2026-11-04-applications",
          "隔离清单不属于本次事件。")
    check_digest(args.expected_sha256, manifest.get("archive_sha256"), "隔离清单归档账本")
    if args.archive is not None:
        check_digest(args.expected_sha256, sha256(archive_ledger(args.archive, args.archive_member)), "归档账本")
    if args.expected_live_sha256 is not None:
        check_digest(args.expected_live_sha256, manifest.get("before_sha256"), "原账本清单")
    if args.expected_candidates_sha256 is not None:
        check_digest(args.expected_candidates_sha256, manifest.get("candidates_sha256"), "候选集合清单")
    before = read_file(root / BACKUP_REL)
    check_digest(manifest.get("before_sha256"), sha256(before), "隔离原始备份")
    candidates, _ = read_records(read_file(root / LEDGER_REL))
    check_digest(manifest.get("candidates_sha256"), sha256(canonical(candidates)), "隔离候选记录")
    attachments = candidate_attachments(candidates)
    after, retained_count, _ = separate_rows(before, candidates)
    check_digest(manifest.get("after_sha256"), sha256(after), "隔离后账本重建")
    restore_layout(args, before, attachments, manifest)
    return {"mode": "rollback", "candidate_count": EXPECTED_ROWS, "attachment_count": EXPECTED_ATTACHMENTS,
            "retained_count": retained_count, "restored_sha256": sha256(before)}


def execute(args):
    if args.rollback:
        return rollback(args)
    plan = build_plan(args)
    if args.apply:
        apply_plan(args, plan)
    return {"mode": "apply" if args.apply else "dry-run", **plan[-1]}


def main(argv):
    try:
        args = parse_args(argv)
        validate_paths(args)
        if args.apply or args.rollback:
            with ledger_write_lock(args.ledger):
                result = execute(args)
        else:
            result = execute(args)
        print(json.dumps(result, ensure_ascii=True, sort_keys=True))
        return 0
    except QuarantineError as error:
        print(f"隔离工具停止。{error}", file=sys.stderr)
    except KeyboardInterrupt:
        print("隔离工具中断。核对私有隔离清单，保持网站停写。", file=sys.stderr)
    except Exception:
        print("隔离工具停止。文件系统、归档或 JSON 核验失败，请核对权限与隔离清单。", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
