/**
 * QueryBuilder & SQL Validator Module
 * 
 * Provides dynamic SQL query construction with robust protection against SQL Injection,
 * strict identifier whitelisting, parameterized bindings, and full PostgreSQL compatibility.
 */

const ALLOWED_TABLES = new Set([
  'users',
  'quizzes',
  'questions',
  'quiz_attempts',
  'question_answers',
  'live_sessions',
  'live_participants',
  'achievements',
  'user_achievements',
  'quiz_requests'
]);

const DANGEROUS_SQL_PATTERNS = [
  /;\s*DROP/i,
  /;\s*DELETE/i,
  /;\s*TRUNCATE/i,
  /;\s*ALTER/i,
  /;\s*UPDATE/i,
  /;\s*INSERT/i,
  /UNION\s+ALL\s+SELECT/i,
  /UNION\s+SELECT/i,
  /--/,
  /\/\*/,
  /\*\//,
  /xp_cmdshell/i,
  /exec\s*\(/i
];

/**
 * Validates table or column identifiers (e.g. "users", "u.email", "count(*)")
 */
function validateIdentifier(identifier, isTable = false) {
  if (typeof identifier !== 'string' || !identifier.trim()) {
    throw new Error(`Invalid identifier: expected non-empty string.`);
  }

  const clean = identifier.trim();

  // Allow star
  if (clean === '*') return clean;

  // Allow simple aggregate function calls like COUNT(*), COUNT(id), MAX(xp)
  const funcMatch = clean.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([a-zA-Z0-9_*.]+)\s*\)$/i);
  if (funcMatch) {
    const fnName = funcMatch[1].toUpperCase();
    const arg = funcMatch[2];
    if (arg !== '*') validateIdentifier(arg);
    return `${fnName}(${arg})`;
  }

  // Check alias formatting like "u.email as user_email"
  if (/\s+as\s+/i.test(clean)) {
    const parts = clean.split(/\s+as\s+/i);
    if (parts.length === 2) {
      validateIdentifier(parts[0]);
      validateIdentifier(parts[1]);
      return `${parts[0]} AS ${parts[1]}`;
    }
  }

  // Handle dot notation (e.g. "u.email")
  const parts = clean.split('.');
  for (const part of parts) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      throw new Error(`Security Violation: Illegal characters in SQL identifier "${clean}".`);
    }
  }

  if (isTable) {
    const tableName = parts[parts.length - 1];
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Security Violation: Access to table "${tableName}" is not allowed.`);
    }
  }

  return clean;
}

/**
 * Checks string inputs for suspicious multi-statement SQL injection attacks.
 */
function checkForSqlInjection(value) {
  if (typeof value === 'string') {
    for (const pattern of DANGEROUS_SQL_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`Security Exception: Potential SQL Injection attack detected in input.`);
      }
    }
  }
}

class QueryBuilder {
  constructor() {
    this._type = 'SELECT';
    this._table = null;
    this._selectCols = ['*'];
    this._whereConditions = [];
    this._joinClauses = [];
    this._orderByClause = null;
    this._limit = null;
    this._offset = null;
    this._insertData = null;
    this._updateData = null;
    this._params = [];
  }

  static table(tableName) {
    return new QueryBuilder().from(tableName);
  }

  from(tableName) {
    validateIdentifier(tableName, true);
    this._table = tableName;
    return this;
  }

  select(...columns) {
    this._type = 'SELECT';
    if (columns.length > 0) {
      const flattened = columns.flat();
      this._selectCols = flattened.map(col => validateIdentifier(col));
    }
    return this;
  }

  where(column, operator, value) {
    if (value === undefined && operator !== undefined) {
      value = operator;
      operator = '=';
    }

    validateIdentifier(column);
    checkForSqlInjection(value);

    const allowedOperators = ['=', '!=', '<>', '>', '<', '>=', '<=', 'LIKE', 'ILIKE'];
    const op = String(operator).toUpperCase();
    if (!allowedOperators.includes(op)) {
      throw new Error(`Invalid comparison operator: "${operator}".`);
    }

    this._params.push(value);
    const paramIndex = this._params.length;
    this._whereConditions.push(`${column} ${op} $${paramIndex}`);
    return this;
  }

  whereIn(column, values) {
    validateIdentifier(column);
    if (!Array.isArray(values) || values.length === 0) {
      // Always false condition if array is empty
      this._whereConditions.push('1 = 0');
      return this;
    }

    const paramPlaceholders = [];
    for (const val of values) {
      checkForSqlInjection(val);
      this._params.push(val);
      paramPlaceholders.push(`$${this._params.length}`);
    }

    this._whereConditions.push(`${column} IN (${paramPlaceholders.join(', ')})`);
    return this;
  }

  whereNull(column, isNull = true) {
    validateIdentifier(column);
    this._whereConditions.push(`${column} IS ${isNull ? '' : 'NOT '}NULL`);
    return this;
  }

  join(table, onCol1, operator, onCol2, type = 'INNER') {
    validateIdentifier(table, true);
    validateIdentifier(onCol1);
    validateIdentifier(onCol2);

    const allowedOps = ['=', '!=', '<>', '>', '<', '>=', '<='];
    const op = String(operator).toUpperCase();
    if (!allowedOps.includes(op)) {
      throw new Error(`Invalid JOIN operator: "${operator}".`);
    }

    const joinType = type.toUpperCase();
    if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(joinType)) {
      throw new Error(`Invalid JOIN type: "${type}".`);
    }

    this._joinClauses.push(`${joinType} JOIN ${table} ON ${onCol1} ${op} ${onCol2}`);
    return this;
  }

  leftJoin(table, onCol1, operator, onCol2) {
    return this.join(table, onCol1, operator, onCol2, 'LEFT');
  }

  orderBy(column, direction = 'ASC') {
    validateIdentifier(column);
    const dir = String(direction).toUpperCase();
    if (!['ASC', 'DESC'].includes(dir)) {
      throw new Error(`Invalid ORDER BY direction: "${direction}". Expected ASC or DESC.`);
    }
    this._orderByClause = `${column} ${dir}`;
    return this;
  }

  limit(count) {
    const parsed = parseInt(count, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(`Invalid LIMIT count: "${count}".`);
    }
    this._limit = parsed;
    return this;
  }

  offset(start) {
    const parsed = parseInt(start, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(`Invalid OFFSET value: "${start}".`);
    }
    this._offset = parsed;
    return this;
  }

  insert(table, data) {
    this._type = 'INSERT';
    validateIdentifier(table, true);
    this._table = table;
    if (!data || typeof data !== 'object') {
      throw new Error('Insert data must be an object or array of objects.');
    }
    this._insertData = data;
    return this;
  }

  update(table, data) {
    this._type = 'UPDATE';
    validateIdentifier(table, true);
    this._table = table;
    if (!data || typeof data !== 'object') {
      throw new Error('Update data must be an object.');
    }
    this._updateData = data;
    return this;
  }

  delete(table) {
    this._type = 'DELETE';
    validateIdentifier(table, true);
    this._table = table;
    return this;
  }

  toSQL() {
    if (!this._table) {
      throw new Error('QueryBuilder error: Target table is not defined.');
    }

    if (this._type === 'SELECT') {
      let sql = `SELECT ${this._selectCols.join(', ')} FROM ${this._table}`;

      if (this._joinClauses.length > 0) {
        sql += ` ${this._joinClauses.join(' ')}`;
      }

      if (this._whereConditions.length > 0) {
        sql += ` WHERE ${this._whereConditions.join(' AND ')}`;
      }

      if (this._orderByClause) {
        sql += ` ORDER BY ${this._orderByClause}`;
      }

      if (this._limit !== null) {
        sql += ` LIMIT ${this._limit}`;
      }

      if (this._offset !== null) {
        sql += ` OFFSET ${this._offset}`;
      }

      return { text: sql, values: this._params };
    }

    if (this._type === 'INSERT') {
      const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
      if (rows.length === 0) {
        throw new Error('Insert data cannot be an empty array.');
      }

      const keys = Object.keys(rows[0]);
      keys.forEach(k => validateIdentifier(k));

      const valueRows = [];
      const insertParams = [];

      for (const row of rows) {
        const rowPlaceholders = [];
        for (const k of keys) {
          const val = row[k];
          checkForSqlInjection(val);
          insertParams.push(val);
          rowPlaceholders.push(`$${insertParams.length}`);
        }
        valueRows.push(`(${rowPlaceholders.join(', ')})`);
      }

      const sql = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES ${valueRows.join(', ')} RETURNING *`;
      return { text: sql, values: insertParams };
    }

    if (this._type === 'UPDATE') {
      const keys = Object.keys(this._updateData);
      if (keys.length === 0) {
        throw new Error('Update data object must contain at least one key.');
      }

      const setClauses = [];
      const updateParams = [];

      for (const k of keys) {
        validateIdentifier(k);
        const val = this._updateData[k];
        checkForSqlInjection(val);
        updateParams.push(val);
        setClauses.push(`${k} = $${updateParams.length}`);
      }

      let sql = `UPDATE ${this._table} SET ${setClauses.join(', ')}`;

      // Append existing WHERE params with offset indices
      if (this._whereConditions.length > 0) {
        const adjustedWheres = [];
        for (const cond of this._whereConditions) {
          // Adjust parameter placeholders like $1 to $N
          const adjusted = cond.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num, 10) + updateParams.length}`);
          adjustedWheres.push(adjusted);
        }
        sql += ` WHERE ${adjustedWheres.join(' AND ')}`;
        updateParams.push(...this._params);
      }

      sql += ' RETURNING *';
      return { text: sql, values: updateParams };
    }

    if (this._type === 'DELETE') {
      let sql = `DELETE FROM ${this._table}`;
      if (this._whereConditions.length > 0) {
        sql += ` WHERE ${this._whereConditions.join(' AND ')}`;
      }
      sql += ' RETURNING *';
      return { text: sql, values: this._params };
    }

    throw new Error(`Unsupported query type: ${this._type}`);
  }

  async execute(dbInstance) {
    const { text, values } = this.toSQL();
    
    // If dbInstance is postgres-js sql function
    if (typeof dbInstance === 'function' && typeof dbInstance.unsafe === 'function') {
      return await dbInstance.unsafe(text, values);
    }
    
    // If dbInstance is Prisma client
    if (dbInstance && typeof dbInstance.$queryRawUnsafe === 'function') {
      return await dbInstance.$queryRawUnsafe(text, ...values);
    }

    throw new Error('QueryBuilder execute error: Valid database connection instance required.');
  }
}

module.exports = {
  QueryBuilder,
  validateIdentifier,
  checkForSqlInjection,
  ALLOWED_TABLES
};
