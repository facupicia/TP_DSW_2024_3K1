import { Category } from "./category.entity"
import { Request, Response } from "express"

export const createCategory = async (req: Request, res: Response) => {

    try {
        const { name } = req.body;
        const category = new Category();
        category.name = name;
        await category.save();
        return res.status(201).json({ message: "Category created successfully", category });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || "Internal server error" });
    }
};


export const getCategories = async (req: Request, res: Response) => {
    try {
        const categories = await Category.find({
            select: {
                id: true,
                name: true
            }
        });

        return res.status(200).json(categories);
    } catch (error: any) {
        return res.status(500).json({ message: error.message || "Internal server error" });
    }
};

export const getCategoryByID = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const categoria = await Category.findOneBy({ id: parseInt(id) });

        if (!categoria) return res.status(404).json({ message: "categoria not found" });

        return res.json(categoria);
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
};


export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const category = await Category.findOneBy({ id: Number(id) });
        if (!category) return res.status(404).json({ message: "Category not found" });
        await category.softRemove();
        return res.status(200).json({ message: "Category deleted successfully" });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || "Internal server error" });
    }
};
