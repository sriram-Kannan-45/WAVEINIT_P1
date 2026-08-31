const {
  parsePagination,
  formatPaginationMeta,
  formatPaginatedResponse
} = require('../src/utils/paginationHelper');

describe('paginationHelper Unit Tests', () => {
  describe('parsePagination', () => {
    test('defaults to page 1 and limit 10 if query is empty', () => {
      const { page, limit, offset } = parsePagination({});
      expect(page).toBe(1);
      expect(limit).toBe(10);
      expect(offset).toBe(0);
    });

    test('parses custom page and limit properly', () => {
      const { page, limit, offset } = parsePagination({ page: '3', limit: '25' });
      expect(page).toBe(3);
      expect(limit).toBe(25);
      expect(offset).toBe(50);
    });

    test('caps limit to maxLimit (100)', () => {
      const { page, limit, offset } = parsePagination({ page: '1', limit: '500' }, 10, 100);
      expect(page).toBe(1);
      expect(limit).toBe(100);
      expect(offset).toBe(0);
    });

    test('handles negative and non-numeric page values gracefully', () => {
      const { page, limit, offset } = parsePagination({ page: '-5', limit: 'invalid' });
      expect(page).toBe(1);
      expect(limit).toBe(10);
      expect(offset).toBe(0);
    });

    test('computes page from offset if offset is provided directly', () => {
      const { page, limit, offset } = parsePagination({ offset: '30', limit: '10' });
      expect(page).toBe(4);
      expect(limit).toBe(10);
      expect(offset).toBe(30);
    });
  });

  describe('formatPaginationMeta', () => {
    test('formats metadata with valid total items and page numbers', () => {
      const meta = formatPaginationMeta(45, 2, 10);
      expect(meta).toEqual({
        page: 2,
        limit: 10,
        totalItems: 45,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true
      });
    });

    test('handles first page boundary', () => {
      const meta = formatPaginationMeta(15, 1, 10);
      expect(meta.page).toBe(1);
      expect(meta.totalPages).toBe(2);
      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPreviousPage).toBe(false);
    });

    test('handles last page boundary', () => {
      const meta = formatPaginationMeta(15, 2, 10);
      expect(meta.page).toBe(2);
      expect(meta.totalPages).toBe(2);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(true);
    });

    test('handles 0 total items', () => {
      const meta = formatPaginationMeta(0, 1, 10);
      expect(meta).toEqual({
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      });
    });
  });

  describe('formatPaginatedResponse', () => {
    test('produces backward-compatible response envelope', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const response = formatPaginatedResponse(items, 20, 1, 10, { customKey: 'customVal' });
      expect(response.success).toBe(true);
      expect(response.data).toEqual(items);
      expect(response.total).toBe(20);
      expect(response.page).toBe(1);
      expect(response.limit).toBe(10);
      expect(response.totalPages).toBe(2);
      expect(response.customKey).toBe('customVal');
      expect(response.pagination).toEqual({
        page: 1,
        limit: 10,
        totalItems: 20,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false
      });
    });
  });
});
