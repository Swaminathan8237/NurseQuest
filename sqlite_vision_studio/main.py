import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
from tkinter import filedialog
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional
import sys

# Local modules
import theme
from db_manager import DatabaseManager
from widgets import ConsoleLogger, SqlEditor, PagedDataGridViewer

def get_resource_path(relative_path: str) -> Path:
    """Get absolute path to resource, works for dev and for PyInstaller"""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = Path(sys._MEIPASS)
    except Exception:
        base_path = Path(__file__).parent
    return base_path / relative_path

def get_config_path() -> Path:
    """Get absolute path to persistent config file next to executable or dev script"""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent / "settings.json"
    else:
        return Path(__file__).parent / "settings.json"

CONFIG_FILE = get_config_path()

class LuminaDbStudioApp:
    """
    Main Application Controller for LuminaDB Studio.
    Coordinates database queries, visual widget updates, and configuration storage.
    """
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("LuminaDB Studio - Enterprise Edition")

        # Set initial window proportions and center it
        self.root.geometry("1200x750")
        self.root.minsize(900, 600)
        self.center_window()
        
        # Initialize DB Core
        self.db = DatabaseManager()
        self.selected_table: Optional[str] = None
        self.recent_dbs: List[str] = []
        
        # Load user configurations
        self.load_settings()

        # Apply global stylesheet theme
        self.style = theme.apply_theme(self.root)

        # Build visual layout
        self.create_layout()
        
        # Clean shutdown protocol
        self.root.protocol("WM_DELETE_WINDOW", self.on_exit)

        # Log system readiness
        self.logger.success("UI widgets loaded successfully. Ready.")
        
        # Auto-connect to the last active database if valid
        self.autoconnect_last_db()
        
        # Set window icon logo
        logo_path = get_resource_path("logo.png")
        if logo_path.exists():
            try:
                # Try loading with Pillow first for robust PNG compatibility
                from PIL import Image, ImageTk
                self.logo_pil = Image.open(logo_path)
                self.logo_img = ImageTk.PhotoImage(self.logo_pil)
                self.root.iconphoto(True, self.logo_img)
            except ImportError:
                # Fallback to native Tkinter PhotoImage
                try:
                    self.logo_img = tk.PhotoImage(file=str(logo_path))
                    self.root.iconphoto(True, self.logo_img)
                except Exception as e:
                    self.logger.warning(
                        "Could not load PNG logo natively. For full logo support, "
                        "please install Pillow: pip install Pillow"
                    )
                    print(f"Failed to set icon natively: {e}")
            except Exception as e:
                print(f"Failed to set icon: {e}")

    def center_window(self):
        self.root.update_idletasks()
        width = 1200
        height = 750
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def create_layout(self):
        """Builds the primary UI structure containing top nav, sidebar, workspace tabs, and logs."""
        
        # 1. Top Navigation Bar
        top_bar = ttk.Frame(self.root, style="Sidebar.TFrame")
        top_bar.pack(fill="x", side="top", ipady=2)
        
        # Brand title
        brand_lbl = ttk.Label(top_bar, text=" LuminaDB Studio ", style="Title.TLabel", background=theme.COLOR_SIDEBAR)
        brand_lbl.pack(side="left", padx=10, pady=5)
        
        # DB connection controls
        ttk.Label(top_bar, text="Database Path:", font=theme.FONT_BOLD, background=theme.COLOR_SIDEBAR).pack(side="left", padx=(15, 5))
        
        self.db_path_entry = ttk.Entry(top_bar, width=45)
        self.db_path_entry.pack(side="left", padx=5, pady=5)
        
        # Primary Action Button
        browse_btn = ttk.Button(top_bar, text="📂 Browse Database...", command=self.browse_db, style="Accent.TButton")
        browse_btn.pack(side="left", padx=5)

        ttk.Button(top_bar, text="🔄 Refresh Schema", command=self.refresh_schema).pack(side="left", padx=5)

        # Recent DB selector
        ttk.Label(top_bar, text="Recents:", font=theme.FONT_BODY, background=theme.COLOR_SIDEBAR).pack(side="left", padx=(20, 5))
        self.recent_combo = ttk.Combobox(top_bar, state="readonly", width=30)
        self.recent_combo.pack(side="left", padx=5)
        self.recent_combo.bind("<<ComboboxSelected>>", self.on_recent_selected)
        self.update_recent_combo_values()

        # 2. Diagnostics Console (Bottom Panel)
        self.logger = ConsoleLogger(self.root)
        self.logger.pack(fill="x", side="bottom", padx=5, pady=5)

        # 3. Main Workspace Division (Paned Window)
        paned = ttk.Panedwindow(self.root, orient="horizontal")
        paned.pack(fill="both", expand=True, padx=5, pady=2)
        
        # Sidebar Frame (Left)
        sidebar = ttk.Frame(paned, style="Sidebar.TFrame", width=260)
        sidebar.pack(fill="both", expand=True)
        sidebar.pack_propagate(False) # Keep width fixed at 260px
        paned.add(sidebar, weight=1)
        
        # Header for Schema Explorer
        sidebar_title = ttk.Frame(sidebar, style="Sidebar.TFrame")
        sidebar_title.pack(fill="x", padx=8, pady=(8, 2))
        ttk.Label(sidebar_title, text="DATABASE SCHEMAS", style="Sidebar.TLabel").pack(side="left")
        
        # Filter table entry
        self.schema_filter_var = tk.StringVar()
        self.schema_filter_var.trace_add("write", lambda *args: self.populate_schema_tree())
        sf_entry = ttk.Entry(sidebar, textvariable=self.schema_filter_var, font=theme.FONT_BODY)
        sf_entry.pack(fill="x", padx=8, pady=(2, 6))
        sf_entry.insert(0, "")
        
        # Binding temporary hint text is handled by trace cleanly:
        # We can also add a placeholder label if needed, but simple filtering is very intuitive.

        # Sidebar Schema Treeview
        self.schema_tree = ttk.Treeview(sidebar, selectmode="browse", show="tree")
        self.schema_tree.pack(fill="both", expand=True, padx=8, pady=5)
        self.schema_tree.bind("<<TreeviewSelect>>", self.on_schema_item_selected)
        
        # Main Work Panel Notebook (Right)
        self.notebook = ttk.Notebook(paned)
        self.notebook.pack(fill="both", expand=True)
        paned.add(self.notebook, weight=4)

        # Workspace Tab 1: Paged Table Data Browser
        self.grid_viewer = PagedDataGridViewer(
            self.notebook, 
            data_fetch_callback=self.fetch_paged_table_data,
            logger=self.logger
        )
        self.notebook.add(self.grid_viewer, text="📋 Table Browser")

        # Workspace Tab 2: SQL Editor Studio
        sql_tab = ttk.Frame(self.notebook)
        self.notebook.add(sql_tab, text="⚡ SQL Editor")
        
        # Vertical split inside SQL tab: top half SQL Editor, bottom half query result grid
        sql_paned = ttk.Panedwindow(sql_tab, orient="vertical")
        sql_paned.pack(fill="both", expand=True)
        
        self.sql_editor = SqlEditor(sql_paned, run_callback=self.run_custom_query, logger=self.logger)
        sql_paned.add(self.sql_editor, weight=2)
        
        self.query_grid = PagedDataGridViewer(
            sql_paned, 
            data_fetch_callback=self.fetch_paged_table_data, # fallback, not used for query results
            logger=self.logger
        )
        sql_paned.add(self.query_grid, weight=3)

        # Workspace Tab 3: Table Schema Inspector
        schema_inspector_tab = ttk.Frame(self.notebook)
        self.notebook.add(schema_inspector_tab, text="🔧 Table Schema")
        
        # Vertical split inside schema tab for columns and indexes
        schema_paned = ttk.Panedwindow(schema_inspector_tab, orient="vertical")
        schema_paned.pack(fill="both", expand=True, padx=5, pady=5)
        
        # Column list
        col_frame = ttk.Frame(schema_paned)
        ttk.Label(col_frame, text="Columns Metadata", font=theme.FONT_BOLD).pack(anchor="w", pady=(2, 4))
        
        # Scrollbars and treeview for columns
        col_scroll = ttk.Scrollbar(col_frame, orient="vertical")
        col_scroll.pack(side="right", fill="y")
        self.col_info_tree = ttk.Treeview(col_frame, yscrollcommand=col_scroll.set, selectmode="none")
        self.col_info_tree.pack(side="left", fill="both", expand=True)
        col_scroll.configure(command=self.col_info_tree.yview)
        
        self.col_info_tree["columns"] = ("name", "type", "pk", "notnull", "default")
        self.col_info_tree.column("#0", width=40, stretch=False, anchor="center")
        self.col_info_tree.column("name", width=180, anchor="w")
        self.col_info_tree.column("type", width=120, anchor="w")
        self.col_info_tree.column("pk", width=80, anchor="center")
        self.col_info_tree.column("notnull", width=80, anchor="center")
        self.col_info_tree.column("default", width=150, anchor="w")
        
        self.col_info_tree.heading("#0", text="#")
        self.col_info_tree.heading("name", text="Column Name")
        self.col_info_tree.heading("type", text="Data Type")
        self.col_info_tree.heading("pk", text="Primary Key")
        self.col_info_tree.heading("notnull", text="Not Null")
        self.col_info_tree.heading("default", text="Default Value")
        
        schema_paned.add(col_frame, weight=3)
        
        # Indexes list
        idx_frame = ttk.Frame(schema_paned)
        ttk.Label(idx_frame, text="Indices Metadata", font=theme.FONT_BOLD).pack(anchor="w", pady=(10, 4))
        
        idx_scroll = ttk.Scrollbar(idx_frame, orient="vertical")
        idx_scroll.pack(side="right", fill="y")
        self.idx_info_tree = ttk.Treeview(idx_frame, yscrollcommand=idx_scroll.set, selectmode="none")
        self.idx_info_tree.pack(side="left", fill="both", expand=True)
        idx_scroll.configure(command=self.idx_info_tree.yview)
        
        self.idx_info_tree["columns"] = ("name", "unique", "columns")
        self.idx_info_tree.column("#0", width=40, stretch=False, anchor="center")
        self.idx_info_tree.column("name", width=250, anchor="w")
        self.idx_info_tree.column("unique", width=100, anchor="center")
        self.idx_info_tree.column("columns", width=300, anchor="w")
        
        self.idx_info_tree.heading("#0", text="#")
        self.idx_info_tree.heading("name", text="Index Name")
        self.idx_info_tree.heading("unique", text="Is Unique")
        self.idx_info_tree.heading("columns", text="Indexed Columns")
        
        schema_paned.add(idx_frame, weight=2)

    # Settings configurations (Save/Load)
    def load_settings(self):
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r") as f:
                    settings = json.load(f)
                    raw_paths = settings.get("recent_databases", [])
                    self.recent_dbs = []
                    for p in raw_paths:
                        try:
                            resolved_path = Path(p).resolve()
                            if resolved_path.exists() and resolved_path.is_file():
                                self.recent_dbs.append(str(resolved_path))
                        except Exception:
                            pass
            except Exception:
                self.recent_dbs = []

    def save_settings(self):
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump({"recent_databases": self.recent_dbs}, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed saving settings file: {str(e)}")

    def add_to_recent(self, db_path: str):
        path_str = str(Path(db_path).resolve())
        if path_str in self.recent_dbs:
            self.recent_dbs.remove(path_str)
        self.recent_dbs.insert(0, path_str)
        self.recent_dbs = self.recent_dbs[:10] # Cap history limit at 10 items
        self.save_settings()
        self.update_recent_combo_values()

    def update_recent_combo_values(self):
        display_names = [Path(path).name for path in self.recent_dbs]
        self.recent_combo["values"] = display_names
        if self.recent_dbs:
            self.recent_combo.set("")

    # DB Connection Handlers
    def autoconnect_last_db(self):
        if self.recent_dbs:
            last_db = self.recent_dbs[0]
            if Path(last_db).exists():
                self.connect_to_db(last_db)
            else:
                self.recent_dbs.pop(0)
                self.save_settings()
                self.update_recent_combo_values()

    def browse_db(self):
        initial_dir = Path.home()
        if self.recent_dbs:
            parent_dir = Path(self.recent_dbs[0]).parent
            if parent_dir.exists():
                initial_dir = parent_dir
                
        file_path = filedialog.askopenfilename(
            initialdir=str(initial_dir),
            title="Open SQLite Database File",
            filetypes=[
                ("SQLite Databases", "*.db;*.sqlite;*.sqlite3;*.db3"),
                ("All Files", "*.*")
            ]
        )
        if file_path:
            self.connect_to_db(file_path)

    def connect_to_db(self, db_path: str):
        self.logger.info(f"Connecting to database: {db_path}...")
        try:
            self.db.connect(db_path)
            self.db_path_entry.delete(0, "end")
            self.db_path_entry.insert(0, db_path)
            
            # Save settings and refresh components
            self.add_to_recent(db_path)
            self.logger.success(f"Successfully connected to '{Path(db_path).name}'")
            
            # Setup preloaded views
            self.selected_table = None
            self.refresh_schema()
            
            # If custom queries are available, populate sample query
            tables = self.db.get_tables()
            if tables:
                sample_table = tables[0]
                safe_name = sample_table.replace('"', '""')
                self.sql_editor.set_query(f'SELECT * FROM "{safe_name}" LIMIT 100;')
                
        except Exception as e:
            self.logger.error(f"Failed to connect to database: {str(e)}")
            messagebox.showerror("Connection Error", f"Unable to load database file:\n{str(e)}")

    def on_recent_selected(self, event=None):
        idx = self.recent_combo.current()
        if idx >= 0 and idx < len(self.recent_dbs):
            selected_path = self.recent_dbs[idx]
            if Path(selected_path).exists():
                self.connect_to_db(selected_path)
            else:
                messagebox.showerror("File Not Found", f"The database file at:\n{selected_path}\nno longer exists.")
                self.recent_dbs.remove(selected_path)
                self.save_settings()
                self.update_recent_combo_values()

    # Schema tree updates
    def refresh_schema(self):
        if not self.db.is_connected():
            self.schema_tree.delete(*self.schema_tree.get_children())
            return
        
        self.logger.info("Scanning database tables & metadata...")
        self.populate_schema_tree()

    def populate_schema_tree(self):
        """Populates the hierarchical Sidebar tree view with quick search filtering."""
        self.schema_tree.delete(*self.schema_tree.get_children())
        
        if not self.db.is_connected():
            return

        filter_q = self.schema_filter_var.get().strip().lower()

        # Categories
        tables_node = self.schema_tree.insert("", "end", text="Tables", open=True)
        views_node = self.schema_tree.insert("", "end", text="Views", open=True)

        # Fetch entities
        tables = self.db.get_tables()
        views = self.db.get_views()

        # Populate tables
        table_count = 0
        for table in tables:
            if filter_q and filter_q not in table.lower():
                continue
            # Fetch row count quickly
            rows_num = self.db.get_table_row_count(table)
            display_text = f"{table} ({rows_num})"
            self.schema_tree.insert(tables_node, "end", text=display_text, values=(table, "table"))
            table_count += 1

        # Populate views
        view_count = 0
        for view in views:
            if filter_q and filter_q not in view.lower():
                continue
            self.schema_tree.insert(views_node, "end", text=view, values=(view, "view"))
            view_count += 1

        # Mute empty sections if filtering
        if not table_count and filter_q:
            self.schema_tree.delete(tables_node)
        if not view_count and filter_q:
            self.schema_tree.delete(views_node)

        self.logger.success(f"Sidebar schema refreshed. Found {len(tables)} tables, {len(views)} views.")

    # Sidebar click selection
    def on_schema_item_selected(self, event=None):
        selection = self.schema_tree.selection()
        if not selection:
            return
            
        item = selection[0]
        values = self.schema_tree.item(item, "values")
        
        if not values or len(values) < 2:
            return # Category header click
            
        entity_name = values[0]
        entity_type = values[1]
        
        self.selected_table = entity_name
        
        # Load details into workspaces
        self.grid_viewer.load_table(entity_name)
        self.load_schema_inspector(entity_name)
        
        # Switch to grid viewer tab automatically
        self.notebook.select(0)
        self.logger.info(f"Loaded entity: {entity_name} ({entity_type})")

    # Load details in schema inspector
    def load_schema_inspector(self, table_name: str):
        # Clear inspector trees
        self.col_info_tree.delete(*self.col_info_tree.get_children())
        self.idx_info_tree.delete(*self.idx_info_tree.get_children())

        # Load Columns
        columns = self.db.get_table_schema(table_name)
        for idx, col in enumerate(columns):
            tag = "even" if idx % 2 == 0 else "odd"
            self.col_info_tree.insert(
                "", 
                "end", 
                text=str(idx + 1),
                values=(
                    col["name"],
                    col["type"],
                    "✔" if col["pk"] else "",
                    "✔" if col["notnull"] else "",
                    str(col["default_value"]) if col["default_value"] is not None else ""
                ),
                tags=(tag,)
            )

        # Load Indexes
        indexes = self.db.get_table_indexes(table_name)
        for idx, index in enumerate(indexes):
            tag = "even" if idx % 2 == 0 else "odd"
            self.idx_info_tree.insert(
                "", 
                "end", 
                text=str(idx + 1),
                values=(
                    index["name"],
                    "✔" if index["unique"] else "",
                    index["columns"]
                ),
                tags=(tag,)
            )
            
        self.col_info_tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.col_info_tree.tag_configure("odd", background="#222225")
        
        self.idx_info_tree.tag_configure("even", background=theme.COLOR_CONTAINER)
        self.idx_info_tree.tag_configure("odd", background="#222225")

    # Data fetching router callback
    def fetch_paged_table_data(
        self, 
        table_name: str, 
        limit: int, 
        offset: int, 
        sort_column: Optional[str] = None, 
        sort_descending: bool = False,
        search_query: Optional[str] = None
    ) -> Tuple[List[str], List[List[Any]], int]:
        """Bridge routing method called by PagedDataGridViewer."""
        return self.db.get_table_data_paged(
            table_name, limit, offset, sort_column, sort_descending, search_query
        )

    # Custom Query Run Router
    def run_custom_query(self, sql_query: str):
        if not self.db.is_connected():
            messagebox.showwarning("No Database", "Connect to a database before executing SQL.")
            return

        self.logger.info("Executing custom SQL statement...")
        
        # Run query
        headers, rows, status_msg, duration = self.db.execute_query(sql_query)
        
        # Log duration and statement results
        self.logger.query(sql_query, duration)
        
        if "Error" in status_msg or "SQL Error" in status_msg:
            self.logger.error(status_msg)
            messagebox.showerror("Execution Failed", status_msg)
        else:
            # Display rows in query grid
            self.query_grid.set_custom_results(headers, rows, status_msg)

    def on_exit(self):
        """Perform cleanup processes before exiting the application."""
        self.logger.info("Closing application connections...")
        self.db.close()
        self.root.destroy()


def main():
    root = tk.Tk()
    app = LuminaDbStudioApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
