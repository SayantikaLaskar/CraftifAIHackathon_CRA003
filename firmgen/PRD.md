# FirmGen PRD: Takt Andon Tower (ESP32), closed-loop bonus

## Purpose
This is the physical output of the Takt loop. A station camera measures the cycle, Takt decides the
station state, and a tower light at the station shows the operator and line lead that state in real
time. Green means on takt, amber means approaching takt or waiting for parts, and red means over takt.

## Hardware
- ESP32 DevKitC
- Three LEDs (or a 3-colour stack light through a ULN2003): GREEN GPIO 25, AMBER GPIO 26, RED GPIO 27
- Active buzzer on GPIO 14
- Acknowledge push-button on GPIO 0, with pull-up
- Optional SSD1306 128×64 OLED on I2C (SDA 21, SCL 22)

## Interface (frozen)
UART over USB at 115200 8N1. Lines are ASCII and end with `\n`. The sender is either the Takt console
(Web Serial in the Live cell) or the Takt server.
| Command | Meaning |
|---|---|
| `ANDON,<station>,<G\|Y\|R>` | set the tower state for a station, e.g. `ANDON,LC-01,R` |
| `CYCLE,<station>,<seconds>` | report a completed cycle (shown on the OLED) |
| `PING` | the board replies `PONG,<uptime_ms>` |

## Requirements
| ID | Requirement | Acceptance criteria (UART and physical) |
|---|---|---|
| FR-1 | Parse the line protocol | A valid command is acknowledged within 20 ms with `ACK,<cmd>`. A malformed line gets `ERR,<reason>` and the state is unchanged. |
| FR-2 | GREEN state | Only the green LED is on. |
| FR-3 | AMBER state | The amber LED blinks at 1 Hz. |
| FR-4 | RED state | The red LED is solid and the buzzer gives two short beeps on entry. The buzzer repeats every 10 s until acknowledged. |
| FR-5 | Acknowledge | A button press of at least 300 ms silences the buzzer and prints `ACKED,<station>,<ms_in_red>`. The red LED stays on until the state changes. |
| FR-6 | Link watchdog | If no command arrives for 15 s, all LEDs blink amber and white alternately and the board prints `WARN,LINK_LOST`. The next valid command recovers it. |
| FR-7 | OLED (optional) | The display shows the station, the state, the last cycle time and the cycle count. |
| NFR-1 | Latency | From the last byte received to the LED changing takes no more than 10 ms, logged as `T,<us>`. |
| NFR-2 | Robustness | The board handles 50 commands per second for 60 s without resetting or leaking memory. |

## Demo evidence
- The FirmGen traceability report.
- A UART monitor log showing `ACK`, `ACKED` and `T,` lines.
- A video of the tower changing green → amber → red while an operator works slower than takt in the Live cell.
