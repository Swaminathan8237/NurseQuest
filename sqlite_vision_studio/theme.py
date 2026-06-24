import tkinter as tk
from tkinter import ttk

# Modern Dark Theme Color Palette (Inspired by modern IDEs like VS Code)
COLOR_BG = "#1e1e1e"            # Main background (dark charcoal)
COLOR_SIDEBAR = "#252526"       # Sidebar background (slightly lighter dark)
COLOR_CONTAINER = "#2d2d30"     # Inner frame container background
COLOR_BORDER = "#3e3e42"        # Subdued border/divider line
COLOR_ACCENT = "#007acc"        # Active/Selected accent blue
COLOR_ACCENT_HOVER = "#1c97ea"  # Hover state for accent blue
COLOR_TEXT = "#d4d4d4"          # Normal text (muted white)
COLOR_TEXT_BRIGHT = "#ffffff"   # Bright text / headings
COLOR_TEXT_MUTED = "#858585"    # Secondary / disabled text
COLOR_ERROR = "#f48771"         # Warning/error orange-red
COLOR_SUCCESS = "#89d4a3"       # Success green

FONT_FAMILY = "Segoe UI"
FONT_BODY = (FONT_FAMILY, 10)
FONT_BOLD = (FONT_FAMILY, 10, "bold")
FONT_HEADING = (FONT_FAMILY, 11, "bold")
FONT_TITLE = (FONT_FAMILY, 14, "bold")
FONT_CODE = ("Consolas", 10)

def apply_theme(root: tk.Tk) -> ttk.Style:
    """Configures modern dark theme styling for all standard and ttk widgets."""
    
    # Configure root window background
    root.configure(bg=COLOR_BG)
    
    style = ttk.Style()
    
    # Choose standard theme base to override
    # 'clam' is the most customizable default engine on cross-platforms
    style.theme_use('clam')
    
    # Global/Default Styles
    style.configure(".",
        background=COLOR_BG,
        foreground=COLOR_TEXT,
        fieldbackground=COLOR_BG,
        font=FONT_BODY,
        troughcolor=COLOR_BG,
        bordercolor=COLOR_BORDER,
        lightcolor=COLOR_BORDER,
        darkcolor=COLOR_BORDER
    )
    
    # Frame Styles
    style.configure("TFrame", background=COLOR_BG)
    style.configure("Sidebar.TFrame", background=COLOR_SIDEBAR)
    style.configure("Card.TFrame", background=COLOR_CONTAINER, relief="flat")
    
    # Label Styles
    style.configure("TLabel", background=COLOR_BG, foreground=COLOR_TEXT, font=FONT_BODY)
    style.configure("Sidebar.TLabel", background=COLOR_SIDEBAR, foreground=COLOR_TEXT_BRIGHT, font=FONT_BOLD)
    style.configure("Header.TLabel", foreground=COLOR_TEXT_BRIGHT, font=FONT_HEADING)
    style.configure("Title.TLabel", foreground=COLOR_TEXT_BRIGHT, font=FONT_TITLE)
    style.configure("Muted.TLabel", foreground=COLOR_TEXT_MUTED, font=FONT_BODY)
    style.configure("Success.TLabel", foreground=COLOR_SUCCESS, font=FONT_BOLD)
    style.configure("Error.TLabel", foreground=COLOR_ERROR, font=FONT_BOLD)
    
    # Button Styles
    style.configure("TButton",
        background=COLOR_CONTAINER,
        foreground=COLOR_TEXT_BRIGHT,
        bordercolor=COLOR_BORDER,
        darkcolor=COLOR_BORDER,
        lightcolor=COLOR_BORDER,
        relief="flat",
        borderwidth=1,
        padding=(10, 4),
        font=FONT_BOLD
    )
    style.map("TButton",
        background=[("active", COLOR_BORDER), ("disabled", COLOR_BG)],
        foreground=[("active", COLOR_TEXT_BRIGHT), ("disabled", COLOR_TEXT_MUTED)]
    )
    
    # Accent Button (Primary action button)
    style.configure("Accent.TButton",
        background=COLOR_ACCENT,
        foreground=COLOR_TEXT_BRIGHT,
        bordercolor=COLOR_ACCENT,
        relief="flat",
        borderwidth=1,
        padding=(12, 4),
        font=FONT_BOLD
    )
    style.map("Accent.TButton",
        background=[("active", COLOR_ACCENT_HOVER)],
        foreground=[("active", COLOR_TEXT_BRIGHT)]
    )

    # Sidebar Navigation Button (Flat, hover effect)
    style.configure("Nav.TButton",
        background=COLOR_SIDEBAR,
        foreground=COLOR_TEXT,
        bordercolor=COLOR_SIDEBAR,
        relief="flat",
        borderwidth=0,
        padding=(8, 6),
        font=FONT_BODY,
        anchor="w"
    )
    style.map("Nav.TButton",
        background=[("active", COLOR_CONTAINER)],
        foreground=[("active", COLOR_TEXT_BRIGHT)]
    )

    # Entry Field Styles (Text boxes, Comboboxes)
    style.configure("TEntry",
        fieldbackground=COLOR_CONTAINER,
        foreground=COLOR_TEXT_BRIGHT,
        bordercolor=COLOR_BORDER,
        lightcolor=COLOR_BORDER,
        darkcolor=COLOR_BORDER,
        insertcolor=COLOR_TEXT_BRIGHT, # Caret color
        padding=4
    )
    style.map("TEntry",
        bordercolor=[("focus", COLOR_ACCENT)],
        lightcolor=[("focus", COLOR_ACCENT)],
        darkcolor=[("focus", COLOR_ACCENT)]
    )

    style.configure("TCombobox",
        fieldbackground=COLOR_CONTAINER,
        foreground=COLOR_TEXT_BRIGHT,
        bordercolor=COLOR_BORDER,
        lightcolor=COLOR_BORDER,
        darkcolor=COLOR_BORDER,
        arrowcolor=COLOR_TEXT,
        padding=4
    )
    style.map("TCombobox",
        fieldbackground=[("readonly", COLOR_CONTAINER)],
        foreground=[("readonly", COLOR_TEXT_BRIGHT)],
        bordercolor=[("focus", COLOR_ACCENT)]
    )
    
    # Scrollbar Styles
    style.layout("TScrollbar", [
        ("Scrollbar.trough", {
            "children": [
                ("Scrollbar.thumb", {"expand": "1", "sticky": "nswe"})
            ],
            "sticky": "ns"
        })
    ])
    style.configure("TScrollbar",
        troughcolor=COLOR_BG,
        background=COLOR_BORDER,
        bordercolor=COLOR_BG,
        arrowcolor=COLOR_TEXT,
        relief="flat",
        width=10
    )
    style.map("TScrollbar",
        background=[("active", COLOR_ACCENT), ("disabled", COLOR_BG)]
    )

    style.layout("Horizontal.TScrollbar", [
        ("Horizontal.Scrollbar.trough", {
            "children": [
                ("Horizontal.Scrollbar.thumb", {"expand": "1", "sticky": "nswe"})
            ],
            "sticky": "ew"
        })
    ])
    style.configure("Horizontal.TScrollbar",
        troughcolor=COLOR_BG,
        background=COLOR_BORDER,
        bordercolor=COLOR_BG,
        arrowcolor=COLOR_TEXT,
        relief="flat",
        width=10
    )
    style.map("Horizontal.TScrollbar",
        background=[("active", COLOR_ACCENT)]
    )

    # Notebook Tabs Style
    style.configure("TNotebook", 
        background=COLOR_BG, 
        borderwidth=0, 
        relief="flat", 
        padding=0
    )
    style.configure("TNotebook.Tab",
        background=COLOR_SIDEBAR,
        foreground=COLOR_TEXT,
        bordercolor=COLOR_BORDER,
        padding=(16, 6),
        font=FONT_BOLD,
        relief="flat"
    )
    style.map("TNotebook.Tab",
        background=[("selected", COLOR_BG), ("active", COLOR_CONTAINER)],
        foreground=[("selected", COLOR_TEXT_BRIGHT), ("active", COLOR_TEXT_BRIGHT)],
        bordercolor=[("selected", COLOR_BORDER)]
    )

    # Treeview Styles (Tables, Sidebar tree)
    style.configure("Treeview",
        background=COLOR_CONTAINER,
        foreground=COLOR_TEXT,
        fieldbackground=COLOR_CONTAINER,
        rowheight=24,
        borderwidth=0,
        font=FONT_BODY
    )
    style.map("Treeview",
        background=[("selected", COLOR_ACCENT)],
        foreground=[("selected", COLOR_TEXT_BRIGHT)]
    )
    style.configure("Treeview.Heading",
        background=COLOR_SIDEBAR,
        foreground=COLOR_TEXT_BRIGHT,
        bordercolor=COLOR_BORDER,
        font=FONT_BOLD,
        relief="flat",
        padding=(4, 6)
    )
    style.map("Treeview.Heading",
        background=[("active", COLOR_CONTAINER)],
        foreground=[("active", COLOR_TEXT_BRIGHT)]
    )

    # Panedwindow Custom Styling
    style.configure("TPanedwindow", background=COLOR_BORDER)
    style.configure("Sash", background=COLOR_BORDER, width=4)

    return style
