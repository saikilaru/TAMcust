import VisitorRepository from '../database/repositories/visitorRepository';
import Error400 from '../errors/Error400';
import SequelizeRepository from '../database/repositories/sequelizeRepository';
import sdpService from './sdpService'

/**
 * Handles Visitor operations
 */
export default class VisitorService {
  options;

  constructor(options) {
    this.options = options;
  }

  /**
   * Creates a Visitor.
   *
   * @param {*} data
   */
  async create(data) {
    const transaction = await SequelizeRepository.createTransaction(
      this.options.database,
    );

    try {
      const record = await VisitorRepository.create(data, {
        ...this.options,
        transaction,
      });

      await SequelizeRepository.commitTransaction(
        transaction,
      );
      sdpService(record);
      return record;
    } catch (error) {
      await SequelizeRepository.rollbackTransaction(
        transaction,
      );

      SequelizeRepository.handleUniqueFieldError(
        error,
        this.options.language,
        'visitor',
      );

      throw error;
    }
  }

  /**
   * Updates a Visitor.
   *
   * @param {*} id
   * @param {*} data
   */
  async update(id, data) {
    const transaction = await SequelizeRepository.createTransaction(
      this.options.database,
    );

    try {
      const record = await VisitorRepository.update(
        id,
        data,
        {
          ...this.options,
          transaction,
        },
      );

      await SequelizeRepository.commitTransaction(
        transaction,
      );

      return record;
    } catch (error) {
      await SequelizeRepository.rollbackTransaction(
        transaction,
      );

      SequelizeRepository.handleUniqueFieldError(
        error,
        this.options.language,
        'visitor',
      );

      throw error;
    }
  }

  /**
   * Destroy all Visitors with those ids.
   *
   * @param {*} ids
   */
  async destroyAll(ids) {
    const transaction = await SequelizeRepository.createTransaction(
      this.options.database,
    );

    try {
      for (const id of ids) {
        await VisitorRepository.destroy(id, {
          ...this.options,
          transaction,
        });
      }

      await SequelizeRepository.commitTransaction(
        transaction,
      );
    } catch (error) {
      await SequelizeRepository.rollbackTransaction(
        transaction,
      );
      throw error;
    }
  }

  /**
   * Finds the Visitor by Id.
   *
   * @param {*} id
   */
  async findById(id) {
    return VisitorRepository.findById(id, this.options);
  }

  /**
   * Finds Visitors for Autocomplete.
   *
   * @param {*} search
   * @param {*} limit
   */
  async findAllAutocomplete(search, limit) {
    return VisitorRepository.findAllAutocomplete(
      search,
      limit,
      this.options,
    );
  }

  /**
   * Finds Visitors based on the query.
   *
   * @param {*} args
   */
  async findAndCountAll(args) {
    return VisitorRepository.findAndCountAll(
      args,
      this.options,
    );
  }

  /**
   * Imports a list of Visitors.
   *
   * @param {*} data
   * @param {*} importHash
   */
  async import(data, importHash) {
    if (!importHash) {
      throw new Error400(
        this.options.language,
        'importer.errors.importHashRequired',
      );
    }

    if (await this._isImportHashExistent(importHash)) {
      throw new Error400(
        this.options.language,
        'importer.errors.importHashExistent',
      );
    }

    const dataToCreate = {
      ...data,
      importHash,
    };

    return this.create(dataToCreate);
  }

  /**
   * Checks if the import hash already exists.
   * Every item imported has a unique hash.
   *
   * @param {*} importHash
   */
  async _isImportHashExistent(importHash) {
    const count = await VisitorRepository.count(
      {
        importHash,
      },
      this.options,
    );

    return count > 0;
  }
}
