'use strict';

const { departmentRepository, branchRepository, userRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');

/** Departments of the active organisation; a branch must belong to it. */
class DepartmentService {
  constructor({
    departments = departmentRepository,
    branches = branchRepository,
    users = userRepository,
  } = {}) {
    this.departments = departments;
    this.branches = branches;
    this.users = users;
  }

  list(query = {}) {
    const filter = {};
    if (query.branch) filter.branch = query.branch;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    return this.departments.paginate(filter, query);
  }

  async create(input) {
    // Scoped lookups: another organisation's branch or user is simply not found.
    await this.branches.findByIdOrThrow(input.branch, 'Branch');
    if (input.head) await this._requireUser(input.head);
    const department = await this.departments.create(input);
    return department.toJSON();
  }

  async update(id, changes) {
    if (changes.head) await this._requireUser(changes.head);
    const updated = await this.departments.updateById(id, { $set: changes });
    if (!updated) throw ApiError.notFound('Department');
    return updated;
  }

  async _requireUser(id) {
    if (!(await this.users.exists({ _id: id }))) throw ApiError.notFound('User');
  }
}

module.exports = new DepartmentService();
module.exports.DepartmentService = DepartmentService;
