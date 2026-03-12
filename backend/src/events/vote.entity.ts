import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm';

export enum VoteType {
    YN = 'YN',
    MULTIPLE = 'MULTIPLE'
}

export enum VoteStatus {
    WAITING = 'WAITING',
    OPEN = 'OPEN',
    CLOSED = 'CLOSED'
}

@Entity()
export class Vote {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    question: string;

    @Column({
        type: 'varchar',
        default: VoteType.YN
    })
    type: string;

    @Column({
        type: 'varchar',
        default: VoteStatus.WAITING
    })
    status: string;

    @Column({ default: false })
    show_results: boolean;

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne('Event', 'votes', { onDelete: 'CASCADE' })
    event: any;

    @OneToMany('VoteOption', 'vote', { cascade: true })
    options: any[];

    @OneToMany('VoteRecord', 'vote')
    records: any[];
}

@Entity()
export class VoteOption {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    text: string;

    @ManyToOne('Vote', 'options', { onDelete: 'CASCADE' })
    vote: any;

    @OneToMany('VoteRecord', 'option')
    records: any[];
}

@Entity()
export class VoteRecord {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', nullable: true })
    voterIp: string | null;

    @Column({ type: 'varchar', nullable: true })
    voterToken: string | null;

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne('Vote', 'records', { onDelete: 'CASCADE' })
    vote: any;

    @ManyToOne('VoteOption', 'records', { onDelete: 'CASCADE' })
    option: any;
}

