import UserRepository from '../../database/repositories/userRepository';
import Error400 from '../../errors/Error400';
import bcrypt from 'bcrypt';
import EmailSender from '../../services/emailSender';
import jwt from 'jsonwebtoken';
import TenantUserRepository from '../../database/repositories/tenantUserRepository';
import SequelizeRepository from '../../database/repositories/sequelizeRepository';
import { getConfig } from '../../config';
import TenantService from '../tenantService';
import TenantRepository from '../../database/repositories/tenantRepository';
import { tenantSubdomain } from '../tenantSubdomain';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Handles all the Auth operations of the user.
 */
class AuthService {
  /**
   * Signs up with the email and password and returns a JWT token.
   *
   * @param {*} email
   * @param {*} password
   * @param {*} [options]
   */
  static async signup(
    email,
    password,
    invitationToken,
    tenantId,
    options: any = {},
  ) {
    const transaction = await SequelizeRepository.createTransaction(
      options.database,
    );

    try {
      const existingUser = await UserRepository.findByEmail(
        email,
        options,
      );

      // Generates a hashed password to hide the original one.
      const hashedPassword = await bcrypt.hash(
        password,
        BCRYPT_SALT_ROUNDS,
      );

      // The user may already exist on the database in case it was invided.
      if (existingUser) {
        // If the user already have an password,
        // it means that it has already signed up
        const existingPassword = await UserRepository.findPassword(
          existingUser.id,
          options,
        );

        if (existingPassword) {
          throw new Error400(
            options.language,
            'auth.emailAlreadyInUse',
          );
        }

        /**
         * In the case of the user exists on the database (was invited)
         * it only creates the new password
         */
        await UserRepository.updatePassword(
          existingUser.id,
          hashedPassword,
          {
            ...options,
            transaction,
            bypassPermissionValidation: true,
          },
        );

        if (EmailSender.isConfigured) {
          await this.sendEmailAddressVerificationEmail(
            options.language,
            existingUser.email,
            tenantId,
            {
              ...options,
              transaction,
              bypassPermissionValidation: true,
            },
          );
        }

        // Handles onboarding process like
        // invitation, creation of default tenant,
        // or default joining the current tenant
        await this.handleOnboard(
          existingUser,
          invitationToken,
          tenantId,
          {
            ...options,
            transaction,
          },
        );

        const token = jwt.sign(
          { id: existingUser.id },
          getConfig().AUTH_JWT_SECRET,
          { expiresIn: getConfig().AUTH_JWT_EXPIRES_IN },
        );

        await SequelizeRepository.commitTransaction(
          transaction,
        );

        return token;
      }

      const newUser = await UserRepository.createFromAuth(
        {
          firstName: email.split('@')[0],
          password: hashedPassword,
          email: email,
        },
        {
          ...options,
          transaction,
        },
      );

      if (EmailSender.isConfigured) {
        await this.sendEmailAddressVerificationEmail(
          options.language,
          newUser.email,
          tenantId,
          {
            ...options,
            transaction,
          },
        );
      }

      // Handles onboarding process like
      // invitation, creation of default tenant,
      // or default joining the current tenant
      await this.handleOnboard(
        newUser,
        invitationToken,
        tenantId,
        {
          ...options,
          transaction,
        },
      );

      const token = jwt.sign(
        { id: newUser.id },
        getConfig().AUTH_JWT_SECRET,
        { expiresIn: getConfig().AUTH_JWT_EXPIRES_IN },
      );

      await SequelizeRepository.commitTransaction(
        transaction,
      );

      return token;
    } catch (error) {
      await SequelizeRepository.rollbackTransaction(
        transaction,
      );

      throw error;
    }
  }

  /**
   * Finds the user by the email.
   *
   * @param email
   * @param options
   */
  static async findByEmail(email, options: any = {}) {
    return UserRepository.findByEmail(email, options);
  }

  /**
   * Signs in an user with the email and password and returns a JWT token.
   * @param {*} email
   * @param {*} password
   * @param {*} [options]
   */
  static async signin(
    email,
    password,
    invitationToken,
    tenantId,
    options: any = {},
  ) {
    const transaction = await SequelizeRepository.createTransaction(
      options.database,
    );

    try {
      const user = await UserRepository.findByEmail(
        email,
        options,
      );

      if (!user) {
        throw new Error400(
          options.language,
          'auth.userNotFound',
        );
      }

      const currentPassword = await UserRepository.findPassword(
        user.id,
        options,
      );

      if (!currentPassword) {
        throw new Error400(
          options.language,
          'auth.wrongPassword',
        );
      }

      const passwordsMatch = await bcrypt.compare(
        password,
        currentPassword,
      );

      if (!passwordsMatch) {
        throw new Error400(
          options.language,
          'auth.wrongPassword',
        );
      }

      // Handles onboarding process like
      // invitation, creation of default tenant,
      // or default joining the current tenant
      await this.handleOnboard(
        user,
        invitationToken,
        tenantId,
        {
          ...options,
          currentUser: user,
          transaction,
        },
      );

      const token = jwt.sign(
        { id: user.id },
        getConfig().AUTH_JWT_SECRET,
        { expiresIn: getConfig().AUTH_JWT_EXPIRES_IN },
      );

      await SequelizeRepository.commitTransaction(
        transaction,
      );

      return token;
    } catch (error) {
      await SequelizeRepository.rollbackTransaction(
        transaction,
      );

      throw error;
    }
  }

  static async handleOnboard(
    currentUser,
    invitationToken,
    tenantId,
    options,
  ) {
    if (invitationToken) {
      try {
        await TenantUserRepository.acceptInvitation(
          invitationToken,
          {
            ...options,
            currentUser,
            bypassPermissionValidation: true,
          },
        );
      } catch (error) {
        console.error(error);
        // In case of invitation acceptance error, does not prevent
        // the user from sign up/in
      }
    }

    const isMultiTenantViaSubdomain =
      ['multi', 'multi-with-subdomain'].includes(
        getConfig().TENANT_MODE,
      ) && tenantId;

    if (isMultiTenantViaSubdomain) {
      await new TenantService({
        ...options,
        currentUser,
      }).joinWithDefaultRolesOrAskApproval(
        {
          tenantId,
          // leave empty to require admin's approval
          //skilaru - set default for visitors, so that they can self-register
          roles: ["visitor"],
        },
        options,
      );
    }

    const singleTenant =
      getConfig().TENANT_MODE === 'single';

    if (singleTenant) {
      // In case is single tenant, and the user is signing in
      // with an invited email and for some reason doesn't have the token
      // it auto-assigns it
      await new TenantService({
        ...options,
        currentUser,
      }).joinDefaultUsingInvitedEmail(options.transaction);

      // Creates or join default Tenant
      await new TenantService({
        ...options,
        currentUser,
      }).createOrJoinDefault(
        {
          // leave empty to require admin's approval
          roles: ["visitor"],
        },
        options.transaction,
      );
    }
  }

  /**
   * Finds the user based on the JWT token.
   *
   * @param {*} token
   */
  static async findByToken(token, options) {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getConfig().AUTH_JWT_SECRET,
        (err, decoded) => {
          if (err) {
            reject(err);
            return;
          }

          const id = decoded.id;
          UserRepository.findById(id, {
            ...options,
            bypassPermissionValidation: true,
          })
            .then((user) => {
              // If the email sender id not configured,
              // removes the need for email verification.
              if (user && !EmailSender.isConfigured) {
                user.emailVerified = true;
              }

              resolve(user);
            })
            .catch((error) => reject(error));
        },
      );
    });
  }

  /**
   * Sends an email address verification email.
   *
   * @param {*} language
   * @param {*} email
   * @param {*} [options]
   */
  static async sendEmailAddressVerificationEmail(
    language,
    email,
    tenantId,
    options,
  ) {
    if (!EmailSender.isConfigured) {
      throw new Error400(language, 'email.error');
    }

    let link;
    try {
      const tenant = await TenantRepository.findById(
        tenantId,
        { ...options },
      );

      const token = await UserRepository.generateEmailVerificationToken(
        email,
        options,
      );
      link = `${tenantSubdomain.frontendUrl(
        tenant,
      )}/auth/verify-email?token=${token}`;
    } catch (error) {
      console.error(error);
      throw new Error400(
        language,
        'auth.emailAddressVerificationEmail.error',
      );
    }

    return new EmailSender(
      EmailSender.TEMPLATES.EMAIL_ADDRESS_VERIFICATION,
      { link },
    ).sendTo(email);
  }

  /**
   * Sends a password reset email.
   *
   * @param {*} language
   * @param {*} email
   */
  static async sendPasswordResetEmail(
    language,
    email,
    tenantId,
    options,
  ) {
    if (!EmailSender.isConfigured) {
      throw new Error400(language, 'email.error');
    }

    let link;

    try {
      const tenant = await TenantRepository.findById(
        tenantId,
        { ...options },
      );

      const token = await UserRepository.generatePasswordResetToken(
        email,
        options,
      );

      link = `${tenantSubdomain.frontendUrl(
        tenant,
      )}/auth/password-reset?token=${token}`;
    } catch (error) {
      console.error(error);
      throw new Error400(
        language,
        'auth.passwordReset.error',
      );
    }

    return new EmailSender(
      EmailSender.TEMPLATES.PASSWORD_RESET,
      { link },
    ).sendTo(email);
  }

  /**
   * Verifies the user email based on the token.
   *
   * @param {*} token
   * @param {*} options
   */
  static async verifyEmail(token, options) {
    const currentUser = options.currentUser;

    const user = await UserRepository.findByEmailVerificationToken(
      token,
      options,
    );

    if (!user) {
      throw new Error400(
        options.language,
        'auth.emailAddressVerificationEmail.invalidToken',
      );
    }

    if (
      currentUser &&
      currentUser.id &&
      currentUser.id !== user.id
    ) {
      throw new Error400(
        options.language,
        'auth.emailAddressVerificationEmail.signedInAsWrongUser',
        user.email,
        currentUser.email,
      );
    }

    return UserRepository.markEmailVerified(
      user.id,
      options,
    );
  }

  /**
   * Resets the password, validating the password reset token.
   *
   * @param {*} token
   * @param {*} password
   * @param {*} options
   */
  static async passwordReset(
    token,
    password,
    options: any = {},
  ) {
    const user = await UserRepository.findByPasswordResetToken(
      token,
      options,
    );

    if (!user) {
      throw new Error400(
        options.language,
        'auth.passwordReset.invalidToken',
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      BCRYPT_SALT_ROUNDS,
    );

    return UserRepository.updatePassword(
      user.id,
      hashedPassword,
      { ...options, bypassPermissionValidation: true },
    );
  }

  static async changePassword(
    oldPassword,
    newPassword,
    options,
  ) {
    const currentUser = options.currentUser;
    const currentPassword = await UserRepository.findPassword(
      options.currentUser.id,
      options,
    );

    const passwordsMatch = await bcrypt.compare(
      oldPassword,
      currentPassword,
    );

    if (!passwordsMatch) {
      throw new Error400(
        options.language,
        'auth.passwordChange.invalidPassword',
      );
    }

    const newHashedPassword = await bcrypt.hash(
      newPassword,
      BCRYPT_SALT_ROUNDS,
    );

    return UserRepository.updatePassword(
      currentUser.id,
      newHashedPassword,
      options,
    );
  }
}

export default AuthService;
