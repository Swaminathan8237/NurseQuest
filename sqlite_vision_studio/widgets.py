import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
from tkinter import filedialog
import re
import csv
import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional, Callable
import theme

class ConsoleLogger(ttk.Frame):
    """A clean system console to log operations, queries, metrics, and errors."""
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        
        # Heading Frame
        header = ttk.Frame(self)
        header.pack(fill="x", padx=5, pady=2)
        
        ttk.Label(header, text="SYSTEM DIAGNOSTICS & METRICS CONSOLE", font=theme.FONT_BOLD).pack(side="left")
        
        ttk.Button(header, text="Clear Console", command=self.clear, style="TButton").pack(side="right")
        
        # Logger Text widget
        text_frame = ttk.Frame(self)
        text_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        self.text = tk.Text(
            text_frame,
            bg="#181818", # extra dark contrast
            fg=theme.COLOR_TEXT,
            font=theme.FONT_CODE,
            insertbackground=theme.COLOR_TEXT_BRIGHT,
            relief="flat",
            wrap="word",
            state="disabled",
            height=6
        )
        self.text.pack(side="left", fill="both", expand=True)
        
        scroll = ttk.Scrollbar(text_frame, orient="vertical", command=self.text.yview)
        scroll.pack(side="right", fill="y")
        self.text.configure(yscrollcommand=scroll.set)
        
        # Tags for colored outputs
        self.text.tag_configure("info", foreground=theme.COLOR_TEXT)
        self.text.tag_configure("success", foreground=theme.COLOR_SUCCESS)
        self.text.tag_configure("error", foreground=theme.COLOR_ERROR)
        self.text.tag_configure("query", foreground=theme.COLOR_ACCENT_HOVER)
        self.text.tag_configure("system", foreground=theme.COLOR_TEXT_MUTED)

        self.info("System Initialized. Awaiting database connection...")

    def log(self, message: str, tag: str = "info"):
        self.text.configure(state="normal")
        timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        prefix = f"[{timestamp}] "
        self.text.insert("end", prefix, "system")
        self.text.insert("end", f"{message}\n", tag)
        self.text.configure(state="disabled")
        self.text.see("end")

    def info(self, message: str):
        self.log(message, "info")

    def success(self, message: str):
        self.log(message, "success")

    def error(self, message: str):
        self.log(message, "error")

    def query(self, query_str: str, duration: float):
        self.log(f"SQL Execute ({duration * 1000:.1f}ms): {query_str.strip()}", "query")

    def clear(self):
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")


class LineNumberedText(ttk.Frame):
    """A standard Text widget equipped with a synchronized line numbers panel."""
    def __init__(self, parent, **kwargs):
        super().__init__(parent)
        
        # Line numbers canvas
        self.line_canvas = tk.Canvas(
            self,
            width=35,
            bg=theme.COLOR_SIDEBAR,
            highlightthickness=0,
            bd=0
        )
        self.line_canvas.pack(side="left", fill="y")
        
        # Main text editing widget
        self.text = tk.Text(
            self,
            bg=theme.COLOR_CONTAINER,
            fg=theme.COLOR_TEXT_BRIGHT,
            insertbackground=theme.COLOR_TEXT_BRIGHT,
            relief="flat",
            wrap="none",
            undo=True,
            font=theme.FONT_CODE,
            **kwargs
        )
        self.text.pack(side="left", fill="both", expand=True)
        
        # Scrollbars
        self.scroll_y = ttk.Scrollbar(self, orient="vertical", command=self.yview_sync)
        self.scroll_y.pack(side="right", fill="y")
        
        self.text.configure(yscrollcommand=self.scroll_sync)
        
        # Set up events for synchronization
        self.text.bind("<KeyRelease>", self.redraw)
        self.text.bind("<Configure>", self.redraw)
        
        # Tab replacement (4 spaces)
        self.text.bind("<Tab>", self.insert_tab)
        
        self.redraw()

    def insert_tab(self, event):
        self.text.insert("insert", "    ")
        return "break"

    def yview_sync(self, *args):
        self.text.yview(*args)

    def scroll_sync(self, *args):
        self.scroll_y.set(*args)
        self.redraw()

    def redraw(self, event=None):
        self.line_canvas.delete("all")
        
        i = self.text.index("@0,0")
        while True :
            dline = self.text.dlineinfo(i)
            if dline is None: 
                break
            y = dline[1]
            linenum = str(i).split(".")[0]
            self.line_canvas.create_text(
                30, 
                y + 3, 
                anchor="ne", 
                text=linenum, 
                font=theme.FONT_CODE, 
                fill=theme.COLOR_TEXT_MUTED
            )
            i = self.text.index(f"{i}+1line")


class SqlEditor(ttk.Frame):
    """An advanced query formulation studio with SQL coloring and timing metrics."""
    def __init__(self, parent, run_callback: Callable[[str], None], logger: ConsoleLogger, **kwargs):
        super().__init__(parent, **kwargs)
        self.run_callback = run_callback
        self.logger = logger
        self.query_history: List[str] = []

        # Action bar
        actions = ttk.Frame(self)
        actions.pack(fill="x", padx=5, pady=4)
        
        ttk.Label(actions, text="SQL SCRIPT COMPILER", font=theme.FONT_BOLD).pack(side="left")
        
        self.run_btn = ttk.Button(actions, text="⚡ Run Query (F5)", command=self.trigger_run, style="Accent.TButton")
        self.run_btn.pack(side="right", padx=2)
        
        ttk.Button(actions, text="Clear", command=self.clear_editor).pack(side="right", padx=2)
        
        ttk.Label(actions, text="History:", font=theme.FONT_BODY).pack(side="right", padx=5)
        self.history_combo = ttk.Combobox(actions, state="readonly", width=30)
        self.history_combo.pack(side="right", padx=2)
        self.history_combo.bind("<<ComboboxSelected>>", self.load_history)
        
        # Editor
        self.editor = LineNumberedText(self)
        self.editor.pack(fill="both", expand=True, padx=5, pady=2)
        self.editor.text.bind("<F5>", lambda e: self.trigger_run())
        self.editor.text.bind("<KeyRelease>", self.on_text_change, add="+")
        
        # Define syntax tags
        self.keywords = [
            "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "ON", 
            "GROUP", "BY", "ORDER", "LIMIT", "OFFSET", "INSERT", "INTO", "VALUES", 
            "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "INDEX", "PRAGMA",
            "AND", "OR", "IN", "AS", "HAVING", "COUNT", "SUM", "AVG", "MIN", "MAX",
            "NULL", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "INTEGER", "TEXT",
            "REAL", "BLOB", "NOT", "DEFAULT", "UNIQUE", "CHECK"
        ]
        
        # Colors
        self.editor.text.tag_configure("keyword", foreground="#569cd6", font=theme.FONT_CODE) # VS Code light-blue
        self.editor.text.tag_configure("string", foreground="#ce9178", font=theme.FONT_CODE) # VS Code peach-red
        self.editor.text.tag_configure("comment", foreground="#6a9955", font=theme.FONT_CODE) # green comments
        self.editor.text.tag_configure("number", foreground="#b5cea8", font=theme.FONT_CODE) # pale green numbers

    def load_history(self, event=None):
        idx = self.history_combo.current()
        if idx >= 0 and idx < len(self.query_history):
            self.set_query(self.query_history[idx])

    def add_to_history(self, query: str):
        q = query.strip()
        if not q:
            return
        if q in self.query_history:
            self.query_history.remove(q)
        self.query_history.insert(0, q)
        # Limit to last 20
        self.query_history = self.query_history[:20]
        # Summarize for combo preview
        preview_list = [((item[:30] + "...") if len(item) > 30 else item).replace('\n', ' ') for item in self.query_history]
        self.history_combo["values"] = preview_list
        if preview_list:
            self.history_combo.current(0)

    def set_query(self, query: str):
        self.editor.text.delete("1.0", "end")
        self.editor.text.insert("1.0", query)
        self.highlight_syntax()

    def get_query(self) -> str:
        return self.editor.text.get("1.0", "end-1c")

    def trigger_run(self):
        query = self.get_query()
        if not query.strip():
            messagebox.showwarning("Warning", "SQL editor is empty.")
            return
        self.add_to_history(query)
        self.run_callback(query)

    def clear_editor(self):
        self.editor.text.delete("1.0", "end")
        self.editor.redraw()

    def on_text_change(self, event=None):
        self.highlight_syntax()
        self.editor.redraw()

    def highlight_syntax(self):
        """Simple and efficient regex syntax highlighting for SQL code."""
        text_widget = self.editor.text
        content = text_widget.get("1.0", "end")
        
        # Clear tags
        for tag in ["keyword", "string", "comment", "number"]:
            text_widget.tag_remove(tag, "1.0", "end")
            
        # 1. Match Comments (starting with -- or /* */)
        for match in re.finditer(r"--[^\n]*", content):
            start = f"1.0 + {match.start()} chars"
            end = f"1.0 + {match.end()} chars"
            text_widget.tag_add("comment", start, end)

        # 2. Match Strings ('strings' or "strings")
        for match in re.finditer(r"'[^']*'|\"[^\"]*\"", content):
            start = f"1.0 + {match.start()} chars"
            end = f"1.0 + {match.end()} chars"
            text_widget.tag_add("string", start, end)

        # 3. Match Keywords (case insensitive boundaries)
        for keyword in self.keywords:
            pattern = r"\b" + re.escape(keyword) + r"\b"
            for match in re.finditer(pattern, content, flags=re.IGNORECASE):
                # Ensure it's not inside a comment or string
                idx = match.start()
                tags = text_widget.tag_names(f"1.0 + {idx} chars")
                if "comment" not in tags and "string" not in tags:
                    start = f"1.0 + {match.start()} chars"
                    end = f"1.0 + {match.end()} chars"
                    text_widget.tag_add("keyword", start, end)

        # 4. Match Numbers
        for match in re.finditer(r"\b\d+\b", content):
            idx = match.start()
            tags = text_widget.tag_names(f"1.0 + {idx} chars")
            if "comment" not in tags and "string" not in tags and "keyword" not in tags:
                start = f"1.0 + {match.start()} chars"
                end = f"1.0 + {match.end()} chars"
                text_widget.tag_add("number", start, end)


class PagedDataGridViewer(ttk.Frame):
    """
    A grid visualizer panel featuring search indexing, custom column resizing,
    asynchronous header sorting, pagination mechanics, and detail inspections.
    """
    def __init__(self, parent, data_fetch_callback: Callable[..., Tuple[List[str], List[List[Any]], int]], logger: ConsoleLogger, **kwargs):
        super().__init__(parent, **kwargs)
        self.data_fetch_callback = data_fetch_callback
        self.logger = logger
        
        # State indicators
        self.table_name: Optional[str] = None
        self.current_page = 1
        self.page_size = 100
        self.total_records = 0
        self.sort_column: Optional[str] = None
        self.sort_descending = False
        self.search_text = ""
        self.headers: List[str] = []
        self.rows: List[List[Any]] = []

        # Build UI layout
        self.create_widgets()

    def create_widgets(self):
        # 1. Search / Action header panel
        self.control_bar = ttk.Frame(self)
        self.control_bar.pack(fill="x", padx=5, pady=4)

        ttk.Label(self.control_bar, text="Filter Records:", font=theme.FONT_BOLD).pack(side="left", padx=2)
        
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(self.control_bar, textvariable=self.search_var, width=30)
        self.search_entry.pack(side="left", padx=5)
        self.search_entry.bind("<Return>", lambda e: self.trigger_search())
        
        ttk.Button(self.control_bar, text="🔍 Filter", command=self.trigger_search).pack(side="left", padx=2)
        ttk.Button(self.control_bar, text="Reset", command=self.reset_search).pack(side="left", padx=2)
        
        # Export Actions
        ttk.Button(self.control_bar, text="📥 Export CSV", command=self.export_csv).pack(side="right", padx=2)

        # 2. Main data Treeview with scrollbars
        self.grid_frame = ttk.Frame(self)
        self.grid_frame.pack(fill="both", expand=True, padx=5, pady=2)
        
        # Horizontal and Vertical Scrollbars
        self.scroll_y = ttk.Scrollbar(self.grid_frame, orient="vertical")
        self.scroll_y.pack(side="right", fill="y")
        
        self.scroll_x = ttk.Scrollbar(self.grid_frame, orient="horizontal")
        self.scroll_x.pack(side="bottom", fill="x")

        # Treeview
        self.tree = ttk.Treeview(
            self.grid_frame,
            selectmode="browse",
            yscrollcommand=self.scroll_y.set,
            xscrollcommand=self.scroll_x.set
        )
        self.tree.pack(side="left", fill="both", expand=True)
        
        self.scroll_y.configure(command=self.tree.yview)
        self.scroll_x.configure(command=self.tree.xview)
        
        # Double click to inspect record
        self.tree.bind("<Double-1>", self.inspect_record)
        
        # 3. Footer paging panel
        self.pager_frame = ttk.Frame(self)
        self.pager_frame.pack(fill="x", padx=5, pady=4)
        
        # Pagination Controls
        self.btn_first = ttk.Button(self.pager_frame, text="⏮", width=4, command=self.go_first)
        self.btn_first.pack(side="left", padx=2)
        
        self.btn_prev = ttk.Button(self.pager_frame, text="◀", width=4, command=self.go_prev)
        self.btn_prev.pack(side="left", padx=2)
        
        self.page_info_label = ttk.Label(self.pager_frame, text="Page 0 of 0", font=theme.FONT_BODY)
        self.page_info_label.pack(side="left", padx=10)
        
        self.btn_next = ttk.Button(self.pager_frame, text="▶", width=4, command=self.go_next)
        self.btn_next.pack(side="left", padx=2)
        
        self.btn_last = ttk.Button(self.pager_frame, text="⏭", width=4, command=self.go_last)
        self.btn_last.pack(side="left", padx=2)
        
        # Page size
        ttk.Label(self.pager_frame, text="Page Size:", font=theme.FONT_BODY).pack(side="left", padx=(20, 5))
        self.size_combo = ttk.Combobox(self.pager_frame, values=["50", "100", "250", "500"], width=6, state="readonly")
        self.size_combo.set(str(self.page_size))
        self.size_combo.pack(side="left", padx=2)
        self.size_combo.bind("<<ComboboxSelected>>", self.on_page_size_change)
        
        # Total counts label
        self.totals_label = ttk.Label(self.pager_frame, text="Showing 0 of 0 records", font=theme.FONT_BODY)
        self.totals_label.pack(side="right", padx=10)

    def load_table(self, table_name: str):
        """Set active table and reset paging settings."""
        self.table_name = table_name
        self.current_page = 1
        self.sort_column = None
        self.sort_descending = False
        self.search_var.set("")
        self.search_text = ""
        self.refresh_grid()

    def set_custom_results(self, headers: List[str], rows: List[List[Any]], status_msg: str):
        """Displays raw results directly without pagination (used for Custom SQL executions)."""
        self.table_name = None # Disable table mode
        self.headers = headers
        self.rows = rows
        self.total_records = len(rows)
        
        # Hide pager and search actions when viewing custom query results
        self.control_bar.pack_forget()
        self.pager_frame.pack_forget()
        
        # Redraw grid
        self.render_tree()
        self.logger.success(f"Grid populated with custom result set. {status_msg}")

    def enable_table_controls(self):
        """Restores page and filter bars for table-mode viewing."""
        self.control_bar.pack(fill="x", padx=5, pady=4)
        self.pager_frame.pack(fill="x", padx=5, pady=4)

    def refresh_grid(self):
        """Fetches paged data and renders the records in the Treeview."""
        if not self.table_name:
            return
        
        self.enable_table_controls()
        
        # Calculate pagination offset
        offset = (self.current_page - 1) * self.page_size
        
        try:
            self.headers, self.rows, self.total_records = self.data_fetch_callback(
                self.table_name,
                self.page_size,
                offset,
                self.sort_column,
                self.sort_descending,
                self.search_text
            )
            self.render_tree()
            self.update_pager_controls()
        except Exception as e:
            self.logger.error(f"Error fetching data for table '{self.table_name}': {str(e)}")
            messagebox.showerror("Error", f"Could not load data:\n{str(e)}")

    def render_tree(self):
        """Cleans and populates the Treeview columns and row elements."""
        # 1. Clear current Treeview columns and items
        self.tree.delete(*self.tree.get_children())
        
        # Columns setup
        # Add special index/row numbering column as `#0`
        self.tree["columns"] = self.headers
        self.tree.column("#0", width=50, minwidth=40, stretch=False, anchor="center")
        self.tree.heading("#0", text="#")
        
        # Calculate maximum widths based on headers and sample rows to auto-scale columns
        max_col_widths = {col: max(len(str(col)), 8) for col in self.headers}
        for row in self.rows[:100]: # check first 100 rows for size estimation
            for i, val in enumerate(row):
                if i < len(self.headers):
                    col = self.headers[i]
                    max_col_widths[col] = max(max_col_widths[col], len(str(val)))

        for col in self.headers:
            width_px = min(max_col_widths[col] * 9, 350) # capping individual col width at 350px
            width_px = max(width_px, 80) # min width 80px
            
            # Setup sorting markers
            heading_text = col
            if col == self.sort_column:
                heading_text += "  ▼" if self.sort_descending else "  ▲"
                
            self.tree.column(col, width=width_px, minwidth=50, stretch=True, anchor="w")
            self.tree.heading(
                col, 
                text=heading_text, 
                command=lambda c=col: self.sort_by_column(c)
            )

        # 2. Populate rows
        offset = (self.current_page - 1) * self.page_size if self.table_name else 0
        for idx, row in enumerate(self.rows):
            row_num = offset + idx + 1
            # alternating row styles
            tag = "even" if idx % 2 == 0 else "odd"
            self.tree.insert("", "end", iid=str(idx), text=str(row_num), values=row, tags=(tag,))
            
        self.tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.tree.tag_configure("odd", background="#222225")

    def update_pager_controls(self):
        """Adjusts pager button states and page descriptions."""
        if self.page_size <= 0:
            self.page_size = 50
        
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        
        # Page info text
        self.page_info_label.configure(text=f"Page {self.current_page} of {total_pages}")
        
        # Record count info
        offset = (self.current_page - 1) * self.page_size
        shown_end = min(offset + len(self.rows), self.total_records)
        shown_start = offset + 1 if len(self.rows) > 0 else 0
        self.totals_label.configure(text=f"Showing {shown_start}-{shown_end} of {self.total_records} records")
        
        # Set button states
        self.btn_first.configure(state="normal" if self.current_page > 1 else "disabled")
        self.btn_prev.configure(state="normal" if self.current_page > 1 else "disabled")
        self.btn_next.configure(state="normal" if self.current_page < total_pages else "disabled")
        self.btn_last.configure(state="normal" if self.current_page < total_pages else "disabled")

    # Sorting action
    def sort_by_column(self, col: str):
        if not self.table_name:
            return # Sort only enabled in table browsing mode
            
        if self.sort_column == col:
            # Toggle direction
            self.sort_descending = not self.sort_descending
        else:
            self.sort_column = col
            self.sort_descending = False
            
        self.current_page = 1 # Reset to page 1
        self.refresh_grid()

    # Search actions
    def trigger_search(self):
        self.search_text = self.search_var.get().strip()
        self.current_page = 1
        self.refresh_grid()

    def reset_search(self):
        self.search_var.set("")
        self.search_text = ""
        self.current_page = 1
        self.refresh_grid()

    # Pagination navigation
    def go_first(self):
        if self.current_page > 1:
            self.current_page = 1
            self.refresh_grid()

    def go_prev(self):
        if self.current_page > 1:
            self.current_page -= 1
            self.refresh_grid()

    def go_next(self):
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        if self.current_page < total_pages:
            self.current_page += 1
            self.refresh_grid()

    def go_last(self):
        total_pages = max(1, (self.total_records + self.page_size - 1) // self.page_size)
        if self.current_page < total_pages:
            self.current_page = total_pages
            self.refresh_grid()

    def on_page_size_change(self, event=None):
        try:
            self.page_size = int(self.size_combo.get())
        except ValueError:
            self.page_size = 100
        self.current_page = 1
        self.refresh_grid()

    # Double click details dialog
    def inspect_record(self, event=None):
        selection = self.tree.selection()
        if not selection:
            return
        
        row_idx = int(selection[0])
        row_data = self.rows[row_idx]
        
        # Open record details dialog
        dialog = tk.Toplevel(self)
        dialog.title(f"Record Details (Row {row_idx + 1})")
        dialog.geometry("700x550")
        dialog.configure(bg=theme.COLOR_BG)
        dialog.transient(self)
        dialog.grab_set()
        
        # Center dialog
        dialog.update_idletasks()
        width = dialog.winfo_width()
        height = dialog.winfo_height()
        x = (dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (dialog.winfo_screenheight() // 2) - (height // 2)
        dialog.geometry(f"{width}x{height}+{x}+{y}")
        
        # Main layout
        lbl_info = ttk.Label(
            dialog, 
            text=f"Selected row columns inspection. Read long texts or code segments clearly.",
            style="Muted.TLabel"
        )
        lbl_info.pack(fill="x", padx=15, pady=(15, 5))
        
        # Scrollable inspection container
        canvas_frame = ttk.Frame(dialog, style="Card.TFrame")
        canvas_frame.pack(fill="both", expand=True, padx=15, pady=5)
        
        canvas = tk.Canvas(canvas_frame, bg=theme.COLOR_CONTAINER, highlightthickness=0)
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)
        scroll_content = ttk.Frame(canvas, style="Card.TFrame")
        
        scroll_content.bind(
            "<Configure>", 
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=scroll_content, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Configure columns within the inner scroll layout
        scroll_content.columnconfigure(0, weight=0, minsize=150)
        scroll_content.columnconfigure(1, weight=1)
        
        # Populating fields
        for idx, col_name in enumerate(self.headers):
            val = row_data[idx] if idx < len(row_data) else ""
            
            # Label
            lbl = ttk.Label(
                scroll_content, 
                text=col_name, 
                font=theme.FONT_BOLD,
                anchor="e",
                justify="right",
                style="Muted.TLabel"
            )
            lbl.grid(row=idx, column=0, sticky="ne", padx=(10, 15), pady=8)
            
            # Display area based on content length
            str_val = str(val)
            lines_count = len(str_val.split('\n'))
            
            if len(str_val) > 80 or lines_count > 1:
                # Textbox for larger data
                tb = tk.Text(
                    scroll_content,
                    bg=theme.COLOR_BG,
                    fg=theme.COLOR_TEXT_BRIGHT,
                    insertbackground=theme.COLOR_TEXT_BRIGHT,
                    font=theme.FONT_CODE,
                    relief="flat",
                    height=min(max(lines_count, 3), 8),
                    wrap="word"
                )
                tb.insert("1.0", str_val)
                # Read only textbox
                tb.configure(state="disabled")
                tb.grid(row=idx, column=1, sticky="ew", padx=(0, 10), pady=6)
            else:
                # Simple entry field
                ent = ttk.Entry(scroll_content)
                ent.insert(0, str_val)
                ent.configure(state="readonly")
                ent.grid(row=idx, column=1, sticky="ew", padx=(0, 10), pady=6)

        # Close action
        btn_close = ttk.Button(dialog, text="Close Details", command=dialog.destroy, style="TButton")
        btn_close.pack(pady=15)

    # Export records to CSV
    def export_csv(self):
        if not self.rows or not self.headers:
            messagebox.showwarning("Export Empty", "There is no data loaded in the grid to export.")
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
            title="Export Grid Data to CSV"
        )
        if not file_path:
            return
            
        try:
            with open(file_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(self.headers)
                writer.writerows(self.rows)
                
            self.logger.success(f"Successfully exported data to CSV: {file_path}")
            messagebox.showinfo("Export Successful", f"Successfully saved records to CSV:\n{file_path}")
        except Exception as e:
            self.logger.error(f"Failed to export CSV: {str(e)}")
            messagebox.showerror("Export Failed", f"An error occurred writing to CSV file:\n{str(e)}")
