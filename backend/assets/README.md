# Assets

Place font files under `backend/assets/fonts/` to ensure consistent rendering across systems.

Recommended Arabic fonts (copy any available TTF into `backend/assets/fonts/`):
- Amiri-Regular.ttf
- NotoNaskhArabic-Regular.ttf
- Cairo-Regular.ttf

The server will attempt to use the first available font for Arabic PDF exports and the web UI will load `/assets/fonts/Amiri-Regular.ttf` if present.

Directory structure:

backend/assets/
└── fonts/
    ├── Amiri-Regular.ttf
    ├── NotoNaskhArabic-Regular.ttf
    └── Cairo-Regular.ttf

