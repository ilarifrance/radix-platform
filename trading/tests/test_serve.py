import subprocess
from datetime import datetime, timezone

from radix_trading import serve
from radix_trading.config import Settings


def _t(h, m, d=2):
    return datetime(2026, 11, d, h, m, tzinfo=timezone.utc)


def test_slots_hourly_and_daily():
    watch, hourly, live, daily = serve.JOBS
    assert serve.slot(watch, _t(14, 4)) == _t(14, 2)        # ogni 5 minuti ai minuti 2, 7, 12, ...
    assert serve.slot(watch, _t(14, 1)) == _t(13, 57)
    assert serve.slot(watch, _t(14, 7)) == _t(14, 7)
    assert serve.slot(hourly, _t(14, 4)) == _t(13, 5)      # il turno delle 14:05 non e' ancora arrivato
    assert serve.slot(hourly, _t(14, 5)) == _t(14, 5)
    assert serve.slot(live, _t(0, 14)) == _t(23, 15, d=1)   # a cavallo della mezzanotte
    assert serve.slot(daily, _t(22, 29)) == _t(22, 30, d=1)
    assert serve.slot(daily, _t(22, 30)) == _t(22, 30)


def test_due_runs_each_job_once_per_slot_and_catches_up_missed_slots(tmp_path):
    s = Settings(data_dir=tmp_path, mode="research")
    jobs = serve.JOBS[1:]                                   # senza l'osservatorio ogni 5 minuti (sotto)
    last = {j.name: serve.slot(j, _t(13, 0)) for j in jobs}
    assert [j.name for j in serve.due(_t(13, 4), last, s, jobs)] == []
    assert [j.name for j in serve.due(_t(13, 5), last, s, jobs)] == ["hourly"]
    last["hourly"] = _t(13, 5)
    assert [j.name for j in serve.due(_t(13, 5), last, s, jobs)] == []
    assert [j.name for j in serve.due(_t(13, 15), last, s, jobs)] == []      # live saltato: conto vero spento
    # un turno mancato (processo occupato fino alle 13:40) si recupera subito dopo
    assert [j.name for j in serve.due(_t(13, 40), last, s, jobs)] == []
    assert [j.name for j in serve.due(_t(14, 7), last, s, jobs)] == ["hourly"]
    assert [j.name for j in serve.due(_t(22, 31), last, s, jobs)] == ["hourly", "daily"]


def test_news_watch_job_every_five_minutes_and_first_in_line(tmp_path):
    s = Settings(data_dir=tmp_path, mode="research")
    last = {j.name: serve.slot(j, _t(13, 0)) for j in serve.JOBS}
    assert [j.name for j in serve.due(_t(13, 1), last, s)] == []
    assert [j.name for j in serve.due(_t(13, 2), last, s)] == ["osservatorio-notizie"]
    last["osservatorio-notizie"] = _t(13, 2)
    assert [j.name for j in serve.due(_t(13, 6), last, s)] == ["hourly"]
    assert [j.name for j in serve.due(_t(13, 7), last, s)] == ["osservatorio-notizie", "hourly"]
    # dopo un daily lungo (22:30 -> 23:20) si recupera un solo giro, non tutti quelli persi
    last = {j.name: serve.slot(j, _t(22, 31)) for j in serve.JOBS}
    assert [j.name for j in serve.due(_t(23, 20), last, s)] == ["osservatorio-notizie", "hourly"]
    assert serve.JOBS[0].timeout == 4 * 60


def test_live_job_only_with_the_real_account_on(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    s = Settings(data_dir=tmp_path, mode="live")
    last = {j.name: serve.slot(j, _t(13, 0)) for j in serve.JOBS}
    assert [j.name for j in serve.due(_t(13, 16), last, s)] == ["osservatorio-notizie", "hourly", "live"]


def test_loop_runs_due_jobs_in_their_own_process_and_survives_failures(tmp_path, monkeypatch):
    monkeypatch.setenv("RADIX_TRADING_LIVE_CONFIRMED", "si-confermo-denaro-reale")
    s = Settings(data_dir=tmp_path, mode="live")
    calls, logs = [], []
    clock = iter([_t(13, 14), _t(13, 15), _t(13, 15)])

    def runner(cmd, timeout):
        calls.append((cmd[-1], timeout))
        if cmd[-1] == "live":
            raise subprocess.TimeoutExpired(cmd, timeout)
        return subprocess.CompletedProcess(cmd, 0)

    last = serve.loop(s, once=True, now_fn=lambda: next(clock), sleep=lambda n: None, runner=runner, log=logs.append)
    assert calls == [("live", 15 * 60)]                 # all'avvio (13:14) il turno hourly delle 13:05 si considera fatto
    assert last["live"] == _t(13, 15)
    assert any("live: fine, codice 124" in m for m in logs)


def test_serve_command_is_wired(monkeypatch, tmp_path):
    from radix_trading import __main__ as cli
    called = {}
    monkeypatch.setenv("RADIX_TRADING_DATA", str(tmp_path))
    monkeypatch.setattr(cli, "Settings", lambda: Settings(data_dir=tmp_path, mode="research"))
    monkeypatch.setattr(serve, "loop", lambda settings, **kw: called.setdefault("mode", settings.mode))
    assert cli.main(["serve"]) == 0
    assert called == {"mode": "research"}
