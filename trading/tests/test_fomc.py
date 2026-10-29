from datetime import date

from radix_trading.collectors import fomc

CAL = """<h4><a id="1">2025 FOMC Meetings</a></h4>
<div class="fomc-meeting__month"><strong>January</strong></div><div class="fomc-meeting__date">28-29</div>
<div class="fomc-meeting__month"><strong>March</strong></div><div class="fomc-meeting__date">18-19*</div><div>Minutes: Released February 19, 2025</div>
<div class="fomc-meeting__month"><strong>Apr/May</strong></div><div class="fomc-meeting__date">30-1</div>
<h4><a id="2">2020 FOMC Meetings</a></h4>
<div class="fomc-meeting__month"><strong>March</strong></div><div class="fomc-meeting__date">15 (unscheduled)</div>
<div class="fomc-meeting__month"><strong>March</strong></div><div class="fomc-meeting__date">17-18</div>"""


def test_parse_calendar_takes_last_day_and_skips_unscheduled():
    d = fomc.parse_calendar(CAL)
    assert date(2025, 1, 29) in d and date(2025, 3, 19) in d and date(2025, 5, 1) in d
    assert date(2025, 2, 19) not in d and len([x for x in d if x.year == 2025]) == 3
    assert date(2020, 3, 15) not in d and date(2020, 3, 18) in d


def test_parse_historical():
    page = "<h5>January 26-27 Meeting - 2016</h5><p>Statement</p><h5>March 15-16 Meeting - 2016</h5>"
    assert fomc.parse_historical(page, 2016) == [date(2016, 1, 27), date(2016, 3, 16)]
