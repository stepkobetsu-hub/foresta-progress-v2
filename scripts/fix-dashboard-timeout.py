from pathlib import Path

cfg = Path('config.js')
app = Path('app.js')
idx = Path('index.html')

s = cfg.read_text()
s = s.replace('requestTimeoutMs: 20000', 'requestTimeoutMs: 45000')
cfg.write_text(s)

s = app.read_text()
s = s.replace('import { CONFIG } from "./config.js";', 'import { CONFIG } from "./config.js?v=20260831-timeout-1";', 1)
app.write_text(s)

s = idx.read_text()
import re
s = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-timeout-1', s, count=1)
idx.write_text(s)
