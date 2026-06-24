import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

class DatabaseManager:
    """
    Handles SQLite database connections, schema queries, paging, 
    and custom SQL execution with performance timing and robust error handling.
    """
    def __init__(self):
        self.connection: Optional[sqlite3.Connection] = None
        self.db_path: Optional[Path] = None

    def connect(self, path: str) -> None:
        """Establish a connection to the SQLite database."""
        self.close()
        self.db_path = Path(path)
        # Enable URI mode to allow read-only and other flags if needed, 
        # but standard path is fine.
        self.connection = sqlite3.connect(
            str(self.db_path),
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES
        )
        # Enable foreign key support
        self.connection.execute("PRAGMA foreign_keys = ON;")
        # Return row objects instead of plain tuples for easier key-value access if needed,
        # but for grids we often want raw values and column names separately.
        self.connection.row_factory = None 

    def is_connected(self) -> bool:
        """Check if connection is open."""
        if self.connection is None:
            return False
        try:
            # Quick integrity check or lightweight call
            self.connection.execute("SELECT 1;")
            return True
        except sqlite3.Error:
            return False

    def close(self) -> None:
        """Close connection cleanly."""
        if self.connection:
            try:
                self.connection.close()
            except sqlite3.Error:
                pass
            self.connection = None
        self.db_path = None

    def get_tables(self) -> List[str]:
        """Fetch all user tables sorted alphabetically."""
        if not self.connection:
            return []
        cursor = self.connection.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
        )
        return [row[0] for row in cursor.fetchall()]

    def get_views(self) -> List[str]:
        """Fetch all user views sorted alphabetically."""
        if not self.connection:
            return []
        cursor = self.connection.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
        )
        return [row[0] for row in cursor.fetchall()]

    def get_table_row_count(self, table_name: str) -> int:
        """Get total number of records in a table safely using parameterization styling."""
        if not self.connection:
            return 0
        cursor = self.connection.cursor()
        # Note: Table names cannot be parameterized in the standard way (?),
        # so we must sanitize or quote it. SQLite quotes table names in double quotes.
        safe_table_name = table_name.replace('"', '""')
        try:
            cursor.execute(f'SELECT COUNT(*) FROM "{safe_table_name}";')
            return cursor.fetchone()[0]
        except sqlite3.Error:
            return 0

    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Fetch column information for a table:
        cid, name, type, notnull, dflt_value, pk
        """
        if not self.connection:
            return []
        cursor = self.connection.cursor()
        safe_table_name = table_name.replace('"', '""')
        cursor.execute(f'PRAGMA table_info("{safe_table_name}");')
        columns = []
        for row in cursor.fetchall():
            columns.append({
                "id": row[0],
                "name": row[1],
                "type": row[2] or "TEXT",
                "notnull": bool(row[3]),
                "default_value": row[4],
                "pk": bool(row[5])
            })
        return columns

    def get_table_indexes(self, table_name: str) -> List[Dict[str, Any]]:
        """Fetch indexes associated with a table."""
        if not self.connection:
            return []
        cursor = self.connection.cursor()
        safe_table_name = table_name.replace('"', '""')
        cursor.execute(f'PRAGMA index_list("{safe_table_name}");')
        indexes = []
        for row in cursor.fetchall():
            idx_name = row[1]
            unique = bool(row[2])
            # Fetch columns for this index
            safe_idx_name = idx_name.replace('"', '""')
            cursor.execute(f'PRAGMA index_info("{safe_idx_name}");')
            cols = [r[2] for r in cursor.fetchall()]
            indexes.append({
                "name": idx_name,
                "unique": unique,
                "columns": ", ".join(cols)
            })
        return indexes

    def get_table_data_paged(
        self, 
        table_name: str, 
        limit: int, 
        offset: int, 
        sort_column: Optional[str] = None, 
        sort_descending: bool = False,
        search_query: Optional[str] = None
    ) -> Tuple[List[str], List[List[Any]], int]:
        """
        Fetch a page of table records, returning:
        (column_names, rows, filtered_total_count)
        """
        if not self.connection:
            return [], [], 0

        cursor = self.connection.cursor()
        safe_table_name = table_name.replace('"', '""')

        # Fetch columns first
        schema = self.get_table_schema(table_name)
        col_names = [col["name"] for col in schema]
        if not col_names:
            return [], [], 0

        # Construct basic query
        query_base = f'FROM "{safe_table_name}"'
        where_clause = ""
        params = []

        # Client-side style search applied to database query:
        # Check if search query matches any column (basic LIKE search on columns)
        if search_query:
            search_conds = []
            for col in col_names:
                escaped_col = col.replace('"', '""')
                search_conds.append(f'CAST("{escaped_col}" AS TEXT) LIKE ?')
                params.append(f"%{search_query}%")
            if search_conds:
                where_clause = " WHERE " + " OR ".join(search_conds)

        # Count total matches
        count_query = f'SELECT COUNT(*) {query_base}{where_clause}'
        cursor.execute(count_query, params)
        total_count = cursor.fetchone()[0]

        # Construct final retrieval query
        order_clause = ""
        if sort_column and sort_column in col_names:
            safe_sort_col = sort_column.replace('"', '""')
            dir_str = "DESC" if sort_descending else "ASC"
            order_clause = f' ORDER BY "{safe_sort_col}" {dir_str}'

        select_query = f'SELECT * {query_base}{where_clause}{order_clause} LIMIT ? OFFSET ?'
        params.extend([limit, offset])

        cursor.execute(select_query, params)
        rows = cursor.fetchall()
        
        # Format values for display (e.g. binary blob as hex description, nulls formatted)
        formatted_rows = []
        for row in rows:
            formatted_row = []
            for val in row:
                if val is None:
                    formatted_row.append("[NULL]")
                elif isinstance(val, bytes):
                    formatted_row.append(f"<BLOB: {len(val)} bytes, Hex: {val[:8].hex()}...>")
                else:
                    formatted_row.append(str(val))
            formatted_rows.append(formatted_row)

        return col_names, formatted_rows, total_count

    def execute_query(self, sql_query: str) -> Tuple[List[str], List[List[Any]], str, float]:
        """
        Execute arbitrary user SQL queries safely.
        Returns:
            (column_headers, rows, status_message, execution_time_seconds)
        """
        if not self.connection:
            return [], [], "Error: Database not connected.", 0.0

        start_time = time.perf_counter()
        cursor = self.connection.cursor()
        
        # Detect if it's a select or modifying query
        stripped_query = sql_query.strip().upper()
        
        try:
            cursor.execute(sql_query)
            
            # Commit changes automatically for INSERT/UPDATE/DELETE/CREATE/DROP
            is_write = any(stripped_query.startswith(verb) for verb in ["INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "REPLACE"])
            if is_write:
                self.connection.commit()
                rows_affected = self.connection.changes()
                duration = time.perf_counter() - start_time
                return [], [], f"Success: Query executed successfully. {rows_affected} rows affected.", duration

            # It's a query that might return rows (SELECT, PRAGMA, EXPLAIN, etc.)
            description = cursor.description
            col_names = [col[0] for col in description] if description else []
            
            # Fetch all rows for user query (up to safety limit to avoid freezing memory)
            safety_limit = 5000
            rows = cursor.fetchmany(safety_limit)
            has_more = len(cursor.fetchmany(1)) > 0
            
            formatted_rows = []
            for row in rows:
                formatted_row = []
                for val in row:
                    if val is None:
                        formatted_row.append("[NULL]")
                    elif isinstance(val, bytes):
                        formatted_row.append(f"<BLOB: {len(val)} bytes>")
                    else:
                        formatted_row.append(str(val))
                formatted_rows.append(formatted_row)
                
            duration = time.perf_counter() - start_time
            
            record_count = len(formatted_rows)
            more_suffix = f" (capped at {safety_limit} rows)" if has_more else ""
            status = f"Success: {record_count} row(s) returned{more_suffix}."
            
            return col_names, formatted_rows, status, duration
            
        except sqlite3.Error as e:
            duration = time.perf_counter() - start_time
            # Rollback if transaction failed
            try:
                self.connection.rollback()
            except sqlite3.Error:
                pass
            return [], [], f"SQL Error: {str(e)}", duration
        except Exception as e:
            duration = time.perf_counter() - start_time
            return [], [], f"System Error: {str(e)}", duration
