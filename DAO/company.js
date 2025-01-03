// Backend/DAO/company.js
import bcrypt from "bcryptjs";
import crypto from "crypto"; // Para generar un token único
import jwt from "../services/jwt.js";
import CompanyModel from "../models/company.js";
import Database from "./database.js";
import { sendVerificationEmail } from "../services/email.js";

class Company {
  constructor({
    legal_id = "",
    name = "",
    email = "",
    password = "",
    sectors = "",
    size = "",
    location = "",
    website = "",
    phone = "",
    description = "",
    verificationToken = "",
    verified = "",
  } = {}) {
    this.legal_id = legal_id;
    this.name = name;
    this.email = email;
    this.password = password;
    this.sectors = sectors;
    this.size = size;
    this.location = location;
    this.website = website;
    this.phone = phone;
    this.description = description;
    this.verificationToken = verificationToken;
    this.verified = verified;
    console.log("Instancia Empresa creada");
  }

  async register() {
    try {
      const db = Database.getInstance();
      // Control de empresas duplicadas
      const existingCompany = await db.findOne(CompanyModel, {
        $or: [
          { email: this.email.toLowerCase() },
          { legal_id: this.legal_id.toLowerCase() },
        ],
      });

      if (existingCompany) {
        return {
          status: "error",
          message: "La empresa ya existe",
          statusCode: 409,
        };
      }

      // Cifrar la contraseña antes de guardarla
      if (this.password) {
        this.password = await bcrypt.hash(this.password, 10);
      }

      // Crear un token de verificación único
      const verificationToken = crypto.randomBytes(32).toString("hex");

      // Guardar la empresa en la base de datos con el token de verificación
      const companyStored = await db.registerCompany({
        ...this,
        verificationToken: verificationToken,
        verified: false, // Inicialmente no está verificada
      });

      // Enviar correo electrónico con el token de verificación
      await sendVerificationEmail(this.email, verificationToken);

      return {
        status: "success",
        message: "Empresa registrada correctamente. Por favor verifica tu correo electrónico.",
        company: {
          companyStored
        },
      };
    } catch (error) {
      console.error("Error al registrar empresa:", error);
      return {
        status: "error",
        message: "Error en el registro de la empresa",
        statusCode: 500,
      };
    }
  }

  async verify(token){
    console.log("Verificando empresa DAO verify");

    try {
      const db = Database.getInstance();
      const company = await db.findOne(CompanyModel, { verificationToken: token });
  
      if (!company) {
        return {
          status: "error",
          message: "Token de verificación inválido o expirado.",
        };
      }
  
      // Marcar la cuenta como verificada
      company.verified = true;
      company.verificationToken = null; // Eliminar el token después de la verificación
      await company.save();
  
      return {
        status: "success",
        message: "Cuenta verificada correctamente.",
      };
    } catch (error) {
      console.error("Error al verificar la cuenta:", error);
      return {
        status: "error",
        message: "Error al verificar la cuenta.",
      };
    }
  }

  async login(companyData) {
    try {
      const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
      // Buscar la empresa en la base de datos
      const company = await db.findOne(CompanyModel, {
        email: companyData.email,
      });
      if (!company) {
        return {
          status: "error",
          message: "No existe la empresa",
          statusCode: 404,
        };
      }
      console.log("Email ingresado:", companyData.email);
      console.log("Contraseña ingresada:", companyData.password);
      console.log("Contraseña almacenada en DB:", company.password);

      // Verificar la contraseña
      const pwdMatch = await bcrypt.compare(
        companyData.password,
        company.password
      );
      
      console.log("Resultado de comparación:", pwdMatch);
      
      if (!pwdMatch) {
        return {
          status: "error",
          message: "Contraseña incorrecta",
          statusCode: 400,
        };
      }

      // Generar token si la autenticación es exitosa
      const token = jwt.createToken(company);

      return {
        status: "success",
        message: "Empresa identificada correctamente",
        user: {
          id: company._id,
          name: company.name,
          email: company.email,
          legal_id: company.legal_id,
          verified: company.verified,
          isCompany: true, // Asegurarse de enviar false para los usuarios
        },
        token,
      };
    } catch (error) {
      console.error("Error en el proceso de login:", error);
      return {
        status: "error",
        message: "Error en el servidor",
        statusCode: 500,
      };
    }
  }

  async updateProfile(companyId, companyToUpdate) {
    try {
      const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
      console.log("Intentando conectarse a bbdd");
      // Actualizar la empresa en la base de datos
      const updatedCompany = await CompanyModel.findByIdAndUpdate(
        companyId,
        companyToUpdate,
        { new: true }
      );

      if (!updatedCompany) {
        return {
          status: "error",
          message: "Error al actualizar la empresa",
        };
      }

      return {
        status: "success",
        message: "Perfil de empresa actualizado correctamente",
        company: updatedCompany,
      };
    } catch (error) {
      console.error("Error al actualizar la empresa:", error);
      return {
        status: "error",
        message: "Error en el proceso de actualización",
      };
    }
  }

  static async getProfile(companyId) {
    try {
      const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
      console.log("Intentando conectarse a bbdd");
      const companyProfile = await CompanyModel.findById(companyId).select(
        "-password -__v"
      );
      if (!companyProfile) {
        throw new Error("No se encontró la empresa");
      }
      console.log("companytProfile", companyProfile);
      return companyProfile;
    } catch (error) {
      console.error("Error al obtener el perfil de la empresa:", error);
      throw new Error("Error al obtener el perfil de la empresa");
    }
  }

  // Obtener los contadores de la empresa
  static async getCounters(companyId) {
    try {
      // Como no hay relaciones de seguimiento para empresas, devolvemos valores estáticos.
      return {
        companyId,
        following: 0, // Ninguna empresa sigue a otras
        followed: 0, // Ninguna empresa tiene seguidores
        publications: 0, // Por ahora, sin publicaciones asociadas
      };
    } catch (error) {
      console.error("Error al obtener los contadores de la empresa:", error);
      throw new Error("Error al obtener los contadores de la empresa");
    }
  }

  static async setCompanyImg(companyId, file) {
    const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
    console.log("Intentando conectarse a bbdd");
    if (!file) {
      throw new Error("No se ha proporcionado ninguna imagen");
    }
    // Obtener la extensión del archivo
    const image = file.filename;
    try {
      // Actualizar la propiedad "image" en la base de datos
      const companyUpdated = await CompanyModel.findByIdAndUpdate(
        companyId,
        { image: image },
        { new: true } // Devolver el nuevo documento actualizado
      );

      if (!companyUpdated) {
        throw new Error("Error al actualizar la empresa");
      }

      return {
        status: "success",
        user: companyUpdated,
        file,
      };
    } catch (error) {
      console.error("Error al actualizar la imagen:", error);
      throw new Error("Error al subir el avatar");
    }

  }

  static async getCompanyImg(file) {
    const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
    console.log("Intentando conectarse a bbdd");
    const filePath = path.resolve(`./uploads/avatars/${file}`);

    // Verificar si el archivo existe
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (error) => {
        if (error) {
          reject(new Error("No existe la imagen"));
        } else {
          resolve(filePath);
        }
      });
    });
  }

  // Obtener todas las empresas
  static async getAllCompanies() {
    try {
      const db = Database.getInstance(); // Esto llama al constructor y, a su vez, al método connect()
      console.log("Intentando conectarse a bbdd");
      // Aquí podemos filtrar y seleccionar solo los campos necesarios
      const companies = await CompanyModel.find().select("name sectors");
      return companies;
    } catch (error) {
      console.error("Error al obtener la lista de empresas:", error);
      throw new Error("Error al obtener las empresas");
    }
  }

  // Obtener empresas segun el sector
  static async getCompaniesBySector(sector) {
    try {
      // Buscar empresas que tengan el sector solicitado
      const companies = await CompanyModel.find({ sectors: sector }).select(
        "name location sectors size website phone description image"
      ); // Puedes ajustar los campos que quieres devolver
      return companies;
    } catch (error) {
      console.error("Error al obtener empresas por sector:", error);
      throw new Error("Error al obtener empresas por sector");
    }
  }


  static async generatePasswordResetToken(email) {
    // Obtener instancia del DAO
    const db = Database.getInstance();

    // Buscar empresa por correo
    const company = await db.findOne(CompanyModel, { email: email.toLowerCase() });
    if (!company) {
      throw new Error("No se encontró una empresa con ese correo electrónico.");
    }

    // Generar token único
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 3600000; // Expira en 1 hora

    // Actualizar el usuario con el token y la expiración usando updateUser
    const updatedCompany = await db.updatedCompany(company._id, {
      reset_token: token,
      reset_expires: expires,
    });

    if (!updatedCompany) {
      throw new Error("Error al guardar el token de recuperación.");
    }

    // Enviar el correo de recuperación
    await sendPasswordResetEmail(email, token);

    return token;
  }

  static async resetPassword(token, newPassword) {
    const db = Database.getInstance();

    // Buscar la empresa por el token
    const company = await db.findOne(CompanyModel, { reset_token: token });
    if (!company) {
      throw new Error("Token inválido o empresa no encontrada.");
    }

    // Verificar si el token ha expirado
    if (Date.now() > company.reset_expires) {
      throw new Error("El token ha expirado.");
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar la contraseña y limpiar el token
    const updatedCompany = await db.updateCompany(company._id, {
      password: hashedPassword,
      reset_token: null,
      reset_expires: null,
    });

    if (!updatedCompany) {
      throw new Error("Error al actualizar la contraseña.");
    }

    return true;
  }
}

export default Company;
